"""
Evaluation harness for the LSTM prediction model.

Rebuilds the exact dataset and 80/20 chronological split used by
``notebook/train_v3.ipynb``, runs the deployed checkpoint over the held-out
test window, and scores it against trivial baselines so the model's numbers
can be defended rather than just quoted.

Metrics reported:
  - RMSE / MAE on the predicted log return (the model's native target).
  - RMSE / MAE on the reconstructed USD price.
  - Directional accuracy -- the share of bars where the predicted sign matches
    the realised sign. This is the number the BUY/SELL/HOLD signal depends on.

Baselines:
  - Naive zero-change: always predicts a log return of 0. Well defined for
    RMSE/MAE; it makes no directional call, so its directional cell is n/a.
  - Majority class: always predicts the more frequent direction in the test
    window. This is the honest floor a directional claim has to clear.
  - Persistence: predicts that the next log return equals the last observed one.

Usage:
    cd services/prediction-service
    python -m app.ml.evaluate
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import requests
import torch

from app.ml.model_manager import ModelManager, TechnicalIndicatorCalculator

logger = logging.getLogger(__name__)

BINANCE_KLINES_URL = "https://fapi.binance.com/fapi/v1/klines"

# Feature order the checkpoint was trained on (train_v3.ipynb).
FEATURE_COLS = ["log_ret", "volume_log", "sentiment", "rsi", "macd", "bb_width"]

# Repository root, derived from this file's location:
# <repo>/services/prediction-service/app/ml/evaluate.py -> up 3 levels for the
# service directory, 2 more for the repo root.
SERVICE_DIR = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
REPO_ROOT = os.path.dirname(os.path.dirname(SERVICE_DIR))

DEFAULT_SENTIMENT_CSV = os.path.join(
    REPO_ROOT, "notebook", "bitcoin_sentiments_21_24.csv"
)
DEFAULT_MODEL_PATH = os.path.join(SERVICE_DIR, "models", "crypto_predictor_btcusdt.pt")
EVAL_DIR = os.path.join(SERVICE_DIR, "eval")
CACHE_DIR = os.path.join(EVAL_DIR, ".cache")


# ---------------------------------------------------------------------------
# Dataset reconstruction (mirrors notebook/train_v3.ipynb)
# ---------------------------------------------------------------------------


@dataclass
class EvalDataset:
    """Windowed dataset plus the metadata needed for price reconstruction."""

    X: np.ndarray  # (n_samples, window_size, n_features), unscaled
    y_log_ret: np.ndarray  # (n_samples,) realised next-bar log return
    last_log_ret: np.ndarray  # (n_samples,) last observed log return in window
    base_close: np.ndarray  # (n_samples,) close the predicted return applies to
    time_index: pd.DatetimeIndex  # (n_samples,) timestamp of each sample
    feature_cols: list[str] = field(default_factory=lambda: list(FEATURE_COLS))


def load_sentiment_series(csv_path: str) -> pd.Series:
    """Read the sentiment CSV and resample it to an hourly mean series."""
    logger.info("Loading sentiment CSV: %s", csv_path)
    df = pd.read_csv(csv_path)
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.set_index("Date").sort_index()

    series = df["Accurate Sentiments"].resample("1h").mean()
    series.name = "sentiment"
    return series


def apply_sentiment_decay(series: pd.Series, decay_factor: float = 0.9) -> pd.Series:
    """
    Carry sentiment forward with exponential decay across hours with no news.

    Mirrors the notebook: any zero-valued hour inherits the previous hour's
    value scaled by ``decay_factor``.
    """
    arr = series.values.copy()
    for i in range(1, len(arr)):
        if arr[i] == 0:
            arr[i] = arr[i - 1] * decay_factor
    return pd.Series(arr, index=series.index)


def fetch_klines(
    symbol: str,
    interval: str,
    start_str: str,
    end_str: str,
    use_cache: bool = True,
) -> pd.DataFrame:
    """
    Fetch OHLCV candles from Binance USD-M futures, with an on-disk cache.

    The cache exists so re-running the evaluation does not re-download three
    years of hourly candles every time.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_path = os.path.join(
        CACHE_DIR, f"klines_{symbol}_{interval}_{start_str}_{end_str}.csv"
    )

    if use_cache and os.path.exists(cache_path):
        logger.info("Using cached candles: %s", cache_path)
        return pd.read_csv(cache_path, index_col="datetime", parse_dates=True)

    logger.info(
        "Fetching %s %s candles from Binance (%s -> %s)",
        symbol,
        interval,
        start_str,
        end_str,
    )

    all_data: list[pd.DataFrame] = []
    params: dict[str, Any] = {"symbol": symbol, "interval": interval, "limit": 1500}
    params["startTime"] = int(pd.Timestamp(start_str).timestamp() * 1000)
    end_ts = int(pd.Timestamp(end_str).timestamp() * 1000)

    while True:
        response = requests.get(BINANCE_KLINES_URL, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()

        if not data or not isinstance(data, list):
            break

        df = pd.DataFrame(
            data,
            columns=[
                "timestamp",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "close_time",
                "q_vol",
                "trades",
                "taker_base",
                "taker_quote",
                "ignore",
            ],
        )
        price_cols = ["open", "high", "low", "close", "volume"]
        df[price_cols] = df[price_cols].astype(float)
        df["datetime"] = pd.to_datetime(df["timestamp"], unit="ms")
        all_data.append(df)

        last_ts = int(df.iloc[-1]["timestamp"])
        if last_ts >= end_ts or len(df) < 100:
            break

        params["startTime"] = last_ts + 1
        time.sleep(0.1)  # stay well under Binance's rate limit

    if not all_data:
        raise RuntimeError(f"Binance returned no candles for {symbol} {interval}")

    final_df = pd.concat(all_data, ignore_index=True)
    final_df = final_df.set_index("datetime").sort_index()
    final_df = final_df.loc[:end_str]
    final_df = final_df[~final_df.index.duplicated(keep="first")]

    final_df.to_csv(cache_path)
    logger.info("Fetched %d candles -> cached at %s", len(final_df), cache_path)
    return final_df


def build_dataset(
    sentiment_csv: str,
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    window_size: int = 24,
    use_cache: bool = True,
) -> EvalDataset:
    """
    Rebuild the notebook's feature matrix and sliding windows.

    Deliberately reproduces ``prepare_dataset_optimized`` step for step so the
    test split scored here is the same one the checkpoint was validated on.
    """
    from ta.momentum import RSIIndicator
    from ta.trend import MACD
    from ta.volatility import BollingerBands

    series_sentiment = load_sentiment_series(sentiment_csv)
    start_date = series_sentiment.index.min().strftime("%Y-%m-%d")
    end_date = series_sentiment.index.max().strftime("%Y-%m-%d")

    df_price = fetch_klines(symbol, interval, start_date, end_date, use_cache)
    df_price.index = pd.to_datetime(df_price.index)

    df = df_price.resample("1h").ffill()
    df = df.join(series_sentiment, how="left")
    df["sentiment"] = df["sentiment"].fillna(0)
    df["sentiment"] = apply_sentiment_decay(df["sentiment"], decay_factor=0.9)

    df["rsi"] = RSIIndicator(close=df["close"], window=14).rsi()
    df["macd"] = MACD(close=df["close"]).macd_diff()
    df["bb_width"] = BollingerBands(
        close=df["close"], window=20, window_dev=2
    ).bollinger_wband()
    df["volume_log"] = np.log1p(df["volume"])

    df["log_ret"] = np.log(df["close"] / df["close"].shift(1))
    df["target"] = df["log_ret"].shift(-1)

    df = df.dropna()

    features = df[FEATURE_COLS].values.astype(np.float32)
    targets = df["target"].values.astype(np.float32)
    closes = df["close"].values.astype(np.float64)

    X_windows, y_values, last_rets, base_closes = [], [], [], []
    for i in range(window_size, len(features)):
        X_windows.append(features[i - window_size : i, :])
        y_values.append(targets[i])
        # Persistence baseline uses the most recent return the window saw.
        last_rets.append(features[i - 1, 0])
        base_closes.append(closes[i])

    return EvalDataset(
        X=np.array(X_windows, dtype=np.float32),
        y_log_ret=np.array(y_values, dtype=np.float64),
        last_log_ret=np.array(last_rets, dtype=np.float64),
        base_close=np.array(base_closes, dtype=np.float64),
        time_index=df.index[window_size:],
    )


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------


def display_path(path: str, base: str) -> str:
    """
    Render ``path`` relative to ``base`` for reports, tolerating other drives.

    ``os.path.relpath`` raises on Windows when the two paths sit on different
    mounts, which would otherwise throw away a finished training run at the
    final metadata-writing step just because ``--output-dir`` pointed at
    another drive.
    """
    try:
        return os.path.relpath(path, base).replace("\\", "/")
    except ValueError:
        return path.replace("\\", "/")


def rmse(pred: np.ndarray, actual: np.ndarray) -> float:
    """Root mean squared error."""
    return float(math.sqrt(np.mean((pred - actual) ** 2)))


def mae(pred: np.ndarray, actual: np.ndarray) -> float:
    """Mean absolute error."""
    return float(np.mean(np.abs(pred - actual)))


def directional_accuracy(pred: np.ndarray, actual: np.ndarray) -> float:
    """
    Share of bars where the predicted direction matches the realised one.

    Bars where the realised return is exactly zero are excluded -- there is no
    direction to get right, and they would otherwise distort the number.
    """
    mask = actual != 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.sign(pred[mask]) == np.sign(actual[mask])))


def score_predictions(
    name: str,
    pred_log_ret: np.ndarray,
    actual_log_ret: np.ndarray,
    base_close: np.ndarray,
    directional: bool = True,
) -> dict[str, Any]:
    """Bundle every metric for one predictor into a single record."""
    pred_price = base_close * np.exp(pred_log_ret)
    actual_price = base_close * np.exp(actual_log_ret)

    return {
        "model": name,
        "rmse_log_return": rmse(pred_log_ret, actual_log_ret),
        "mae_log_return": mae(pred_log_ret, actual_log_ret),
        "rmse_price_usd": rmse(pred_price, actual_price),
        "mae_price_usd": mae(pred_price, actual_price),
        "directional_accuracy": (
            directional_accuracy(pred_log_ret, actual_log_ret) if directional else None
        ),
    }


# ---------------------------------------------------------------------------
# Model inference
# ---------------------------------------------------------------------------


def predict_log_returns(
    manager: ModelManager,
    X: np.ndarray,
    batch_size: int = 512,
) -> np.ndarray:
    """Run the loaded checkpoint over pre-built windows and unscale the output."""
    if manager.model is None:
        raise RuntimeError("Model is not loaded")

    scaled_windows = X
    if manager.scaler_X is not None:
        flat = X.reshape(-1, X.shape[-1])
        scaled_windows = manager.scaler_X.transform(flat).reshape(X.shape)

    preds: list[np.ndarray] = []
    manager.model.eval()
    with torch.no_grad():
        for start in range(0, len(scaled_windows), batch_size):
            batch = torch.FloatTensor(scaled_windows[start : start + batch_size]).to(
                manager.device
            )
            preds.append(manager.model(batch).cpu().numpy())

    pred_scaled = np.concatenate(preds, axis=0)
    if manager.scaler_y is not None:
        return manager.scaler_y.inverse_transform(pred_scaled).flatten()
    return pred_scaled.flatten()


def check_serving_feature_parity(dataset: EvalDataset) -> dict[str, Any]:
    """
    Compare the training-time bb_width against the one the live service computes.

    ``TechnicalIndicatorCalculator.calculate_bollinger_width`` returns a
    fraction; ``ta.BollingerBands.bollinger_wband`` (used to train) returns a
    percentage. If those disagree, the service feeds the model a feature on a
    different scale than it was trained on, and the accuracy reported here is
    not the accuracy production gets.
    """
    closes = dataset.base_close
    sample_end = min(len(closes) - 1, 400)
    window = closes[:sample_end]

    # Line the two up on the same bar. base_close[j] is the close at feature row
    # (j + window_size), and X[j][-1] is feature row (j + window_size - 1), so the
    # bb_width matching the last close in `window` (row sample_end - 1 + window_size)
    # lives at X[sample_end][-1].
    training_bb = float(dataset.X[sample_end, -1, FEATURE_COLS.index("bb_width")])
    serving_bb = float(
        TechnicalIndicatorCalculator.calculate_bollinger_width(
            window, window=20, num_std=2
        )
    )

    ratio = training_bb / serving_bb if serving_bb else float("nan")
    return {
        "training_bb_width_sample": training_bb,
        "serving_bb_width_sample": serving_bb,
        "ratio_training_over_serving": ratio,
        "scales_match": bool(abs(ratio - 1.0) < 0.5),
    }


def check_dataset_reproduction(
    lstm_row: dict[str, Any], extra_info: dict[str, Any]
) -> dict[str, Any]:
    """
    Verify that the rebuilt test split matches the one the checkpoint was scored on.

    ``train_v3.ipynb`` stores its single test-set USD RMSE in the checkpoint's
    ``extra_info``. If the RMSE computed here lands on that number, the dataset
    reconstruction is faithful and every other metric in this report is being
    measured on the same bars the notebook used.
    """
    notebook_rmse = extra_info.get("rmse")
    if not isinstance(notebook_rmse, (int, float)):
        return {"available": False}

    ours = lstm_row["rmse_price_usd"]
    delta = abs(ours - float(notebook_rmse))
    return {
        "available": True,
        "notebook_rmse_usd": float(notebook_rmse),
        "recomputed_rmse_usd": ours,
        "abs_delta_usd": delta,
        "matches": bool(delta < 1.0),
    }


def evaluate_bb_width_mismatch(
    manager: ModelManager,
    X_test: np.ndarray,
    y_test: np.ndarray,
    base_close: np.ndarray,
) -> dict[str, Any]:
    """
    Re-score the model with bb_width divided by 100 (the serving-path scale).

    Isolates the impact of the train/serve feature mismatch: same model, same
    windows, only that one feature rescaled to what the service supplies.
    """
    X_serving = X_test.copy()
    bb_idx = FEATURE_COLS.index("bb_width")
    X_serving[:, :, bb_idx] = X_serving[:, :, bb_idx] / 100.0

    pred = predict_log_returns(manager, X_serving)
    return score_predictions("LSTM (serving-path bb_width)", pred, y_test, base_close)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _fmt_pct(value: float | None) -> str:
    """Render a 0-1 ratio as a percentage, or n/a when there is no call to make."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return f"{value * 100:.1f}%"


def build_verdict(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Turn the metric table into a plain-language pass/fail statement."""
    by_name = {row["model"]: row for row in rows}
    lstm = by_name["LSTM (ours)"]
    majority = by_name["Majority class"]
    persistence = by_name["Persistence"]
    naive = by_name["Naive (0-change)"]

    lstm_dir = lstm["directional_accuracy"]
    beats_majority = lstm_dir > majority["directional_accuracy"]
    beats_persistence = lstm_dir > persistence["directional_accuracy"]
    beats_naive_rmse = lstm["rmse_log_return"] < naive["rmse_log_return"]

    if beats_majority and beats_persistence:
        summary = (
            f"The LSTM calls direction correctly on **{_fmt_pct(lstm_dir)}** of "
            "test bars, beating both the majority-class floor "
            f"({_fmt_pct(majority['directional_accuracy'])}) and persistence "
            f"({_fmt_pct(persistence['directional_accuracy'])}). That is the "
            "number worth citing."
        )
    else:
        beaten_by = []
        if not beats_majority:
            beaten_by.append(
                f"the majority-class floor ({_fmt_pct(majority['directional_accuracy'])})"
            )
        if not beats_persistence:
            beaten_by.append(
                f"persistence ({_fmt_pct(persistence['directional_accuracy'])})"
            )
        summary = (
            f"The LSTM calls direction correctly on **{_fmt_pct(lstm_dir)}** of "
            "test bars, which does **not** beat " + " or ".join(beaten_by) + ". "
            "On this data the model has no demonstrated directional edge — an "
            "honest negative result, and exactly what this harness exists to find."
        )

    notes = [
        f"RMSE on log returns is {'lower' if beats_naive_rmse else 'not lower'} than "
        f"the zero-change baseline ({lstm['rmse_log_return']:.6f} vs "
        f"{naive['rmse_log_return']:.6f}).",
        "A low RMSE against the zero baseline is easy to reach by predicting "
        "near-zero returns and says little on its own. Directional accuracy is the "
        "metric the BUY/SELL/HOLD signal actually depends on.",
    ]

    return {
        "summary": summary,
        "notes": notes,
        "beats_majority_baseline": bool(beats_majority),
        "beats_persistence_baseline": bool(beats_persistence),
        "beats_naive_rmse": bool(beats_naive_rmse),
    }


def render_markdown(report: dict[str, Any]) -> str:
    """Render the report dict as the human-readable report.md."""
    meta = report["dataset"]
    rows = report["results"]
    parity = report["serving_parity"]

    lines: list[str] = []
    lines.append("# LSTM Prediction Model — Evaluation Report")
    lines.append("")
    lines.append(
        f"> Generated by `python -m app.ml.evaluate` on {report['generated_at']}."
    )
    lines.append("")
    lines.append("## Setup")
    lines.append("")
    lines.append(f"- **Checkpoint:** `{report['model']['path']}`")
    lines.append(f"- **Symbol / interval:** {meta['symbol']} / {meta['interval']}")
    lines.append(f"- **Features:** {', '.join(report['model']['feature_cols'])}")
    lines.append(f"- **Window size:** {report['model']['window_size']} bars")
    lines.append(
        f"- **Split:** first {int(meta['train_fraction'] * 100)}% train / last "
        f"{100 - int(meta['train_fraction'] * 100)}% test, chronological "
        "(same split as `notebook/train_v3.ipynb`)"
    )
    lines.append(
        f"- **Test window:** {meta['test_start']} → {meta['test_end']} "
        f"({meta['n_test']:,} bars)"
    )
    lines.append(
        f"- **Test class balance:** {_fmt_pct(meta['up_fraction'])} of bars closed up"
    )
    lines.append("")

    repro = report["reproduction_check"]
    if repro.get("available"):
        if repro["matches"]:
            lines.append(
                "**Reconstruction verified.** `train_v3.ipynb` stored a test RMSE of "
                f"`{repro['notebook_rmse_usd']:.2f}` USD in the checkpoint; rebuilding "
                "the dataset from scratch here reproduces "
                f"`{repro['recomputed_rmse_usd']:.2f}` USD (Δ "
                f"{repro['abs_delta_usd']:.4f}). Every metric below is therefore "
                "measured on the same bars the notebook used."
            )
        else:
            lines.append(
                "**Reconstruction mismatch.** The checkpoint records a test RMSE of "
                f"`{repro['notebook_rmse_usd']:.2f}` USD but this rebuild gets "
                f"`{repro['recomputed_rmse_usd']:.2f}` USD (Δ "
                f"{repro['abs_delta_usd']:.2f}). The test split here is not identical "
                "to the notebook's — treat the numbers below as indicative only."
            )
        lines.append("")

    lines.append("## Results")
    lines.append("")
    lines.append(
        "| Model | RMSE (log-ret) | MAE (log-ret) | RMSE (USD) | Directional Acc. |"
    )
    lines.append("|---|---|---|---|---|")
    for row in rows:
        lines.append(
            f"| {row['model']} "
            f"| {row['rmse_log_return']:.6f} "
            f"| {row['mae_log_return']:.6f} "
            f"| {row['rmse_price_usd']:.2f} "
            f"| {_fmt_pct(row['directional_accuracy'])} |"
        )
    lines.append("")
    lines.append(
        "*The majority-class row borrows the zero-baseline's error columns: it is a "
        "directional baseline only, so its own RMSE/MAE would be meaningless.*"
    )
    lines.append("")

    verdict = report["verdict"]
    lines.append("## Verdict")
    lines.append("")
    lines.append(verdict["summary"])
    lines.append("")
    for note in verdict["notes"]:
        lines.append(f"- {note}")
    lines.append("")

    lines.append("## Train/serve parity check")
    lines.append("")
    if parity["scales_match"]:
        lines.append(
            "`bb_width` is computed on the same scale in training and in the live "
            "service. No mismatch found."
        )
    else:
        lines.append(
            "**Mismatch found.** `bb_width` reaches the model on a different scale "
            "in the live service than it did in training:"
        )
        lines.append("")
        lines.append(
            "- Training (`ta.BollingerBands.bollinger_wband`, a percentage): "
            f"`{parity['training_bb_width_sample']:.6f}`"
        )
        lines.append(
            "- Serving (`TechnicalIndicatorCalculator.calculate_bollinger_width`, "
            f"a fraction): `{parity['serving_bb_width_sample']:.6f}`"
        )
        lines.append(f"- Ratio: **{parity['ratio_training_over_serving']:.1f}x**")
        lines.append("")
        lines.append(
            "The `LSTM (serving-path bb_width)` row re-scores the same checkpoint on "
            "the same windows with only that feature rescaled to what production "
            "supplies. The gap between it and `LSTM (ours)` is what the service is "
            "losing to the bug."
        )
    lines.append("")

    lines.append("## Caveats")
    lines.append("")
    for caveat in report["caveats"]:
        lines.append(f"- {caveat}")
    lines.append("")

    if report.get("plot"):
        lines.append("## Predicted vs actual")
        lines.append("")
        lines.append(f"![Predicted vs actual]({os.path.basename(report['plot'])})")
        lines.append("")

    lines.append("## Reproducing")
    lines.append("")
    lines.append("```bash")
    lines.append("cd services/prediction-service")
    lines.append("pip install -r eval/requirements.txt")
    lines.append("python -m app.ml.evaluate")
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def save_plot(
    time_index: pd.DatetimeIndex,
    actual_price: np.ndarray,
    pred_price: np.ndarray,
    output_path: str,
    look_back: int = 300,
) -> str | None:
    """Save a predicted-vs-actual price chart over the tail of the test window."""
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        logger.warning("matplotlib not installed, skipping plot")
        return None

    fig, ax = plt.subplots(figsize=(13, 5))
    ax.plot(
        time_index[-look_back:],
        actual_price[-look_back:],
        label="Actual",
        color="black",
        alpha=0.7,
        linewidth=1.2,
    )
    ax.plot(
        time_index[-look_back:],
        pred_price[-look_back:],
        label="Predicted",
        color="crimson",
        alpha=0.8,
        linewidth=1.2,
    )
    ax.set_title(f"Predicted vs actual close price (last {look_back} test bars)")
    ax.set_xlabel("Time")
    ax.set_ylabel("BTC price (USD)")
    ax.legend()
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(output_path, dpi=120)
    plt.close(fig)

    logger.info("Saved plot to %s", output_path)
    return output_path


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def run_evaluation(
    model_path: str = DEFAULT_MODEL_PATH,
    sentiment_csv: str = DEFAULT_SENTIMENT_CSV,
    symbol: str = "BTCUSDT",
    interval: str = "1h",
    train_fraction: float = 0.8,
    use_cache: bool = True,
    make_plot: bool = True,
) -> dict[str, Any]:
    """Run the full evaluation and write report.json / report.md into eval/."""
    manager = ModelManager()
    if not manager.load_model(model_path):
        raise RuntimeError(f"Could not load checkpoint: {model_path}")

    dataset = build_dataset(
        sentiment_csv=sentiment_csv,
        symbol=symbol,
        interval=interval,
        window_size=manager.window_size,
        use_cache=use_cache,
    )

    split = int(train_fraction * len(dataset.X))
    X_test = dataset.X[split:]
    y_test = dataset.y_log_ret[split:]
    last_ret_test = dataset.last_log_ret[split:]
    base_close_test = dataset.base_close[split:]
    time_test = dataset.time_index[split:]

    logger.info(
        "Evaluating on %d test samples (%s -> %s)",
        len(X_test),
        time_test[0],
        time_test[-1],
    )

    pred_lstm = predict_log_returns(manager, X_test)

    up_fraction = float(np.mean(y_test > 0))
    majority_sign = 1.0 if up_fraction >= 0.5 else -1.0

    naive_row = score_predictions(
        "Naive (0-change)",
        np.zeros_like(y_test),
        y_test,
        base_close_test,
        directional=False,
    )
    majority_row = score_predictions(
        "Majority class",
        np.full_like(y_test, majority_sign),
        y_test,
        base_close_test,
    )
    # Its RMSE/MAE would describe a +/-1 log return, which is nonsense. It is a
    # directional baseline only, so borrow the zero baseline's error columns.
    for key in ("rmse_log_return", "mae_log_return", "rmse_price_usd", "mae_price_usd"):
        majority_row[key] = naive_row[key]

    results = [
        naive_row,
        majority_row,
        score_predictions("Persistence", last_ret_test, y_test, base_close_test),
        score_predictions("LSTM (ours)", pred_lstm, y_test, base_close_test),
    ]

    parity = check_serving_feature_parity(dataset)
    if not parity["scales_match"]:
        results.append(
            evaluate_bb_width_mismatch(manager, X_test, y_test, base_close_test)
        )

    os.makedirs(EVAL_DIR, exist_ok=True)

    plot_path = None
    if make_plot:
        plot_path = save_plot(
            time_test,
            base_close_test * np.exp(y_test),
            base_close_test * np.exp(pred_lstm),
            os.path.join(EVAL_DIR, "pred_vs_actual.png"),
        )

    report: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": {
            "path": display_path(model_path, REPO_ROOT),
            "feature_cols": manager.feature_cols,
            "window_size": manager.window_size,
            "training_extra_info": manager.extra_info,
        },
        "dataset": {
            "symbol": symbol,
            "interval": interval,
            "sentiment_csv": display_path(sentiment_csv, REPO_ROOT),
            "n_total": int(len(dataset.X)),
            "n_train": int(split),
            "n_test": int(len(X_test)),
            "train_fraction": train_fraction,
            "test_start": str(time_test[0]),
            "test_end": str(time_test[-1]),
            "up_fraction": up_fraction,
        },
        "results": results,
        "reproduction_check": check_dataset_reproduction(results[3], manager.extra_info),
        "serving_parity": parity,
        "verdict": build_verdict(results),
        "caveats": [
            "The scalers come from the checkpoint, which fitted them on the full "
            "series before splitting (as the notebook did). That leaks test-window "
            "scale statistics into training. It flatters the numbers slightly and "
            "should be fixed on the next retrain.",
            "Training windows end one bar before the bar whose return is predicted, "
            "while the live service builds its window right up to the latest candle. "
            "That one-bar offset is a second train/serve difference worth closing.",
            "Sentiment comes from a static 2021-2024 CSV, not from the live "
            "sentiment-service, so this says nothing about how the deployed "
            "sentiment feature behaves.",
            "Fees and slippage are ignored. Directional accuracy above the baseline "
            "is not the same thing as a profitable strategy.",
        ],
        "plot": (
            display_path(plot_path, REPO_ROOT) if plot_path else None
        ),
    }

    json_path = os.path.join(EVAL_DIR, "report.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)

    md_path = os.path.join(EVAL_DIR, "report.md")
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write(render_markdown(report))

    logger.info("Wrote %s and %s", json_path, md_path)
    return report


def print_table(report: dict[str, Any]) -> None:
    """Print the results table to stdout."""
    print()
    print(f"{'Model':<34}{'RMSE (log-ret)':>16}{'MAE':>12}{'Directional Acc.':>20}")
    print("-" * 82)
    for row in report["results"]:
        print(
            f"{row['model']:<34}"
            f"{row['rmse_log_return']:>16.6f}"
            f"{row['mae_log_return']:>12.6f}"
            f"{_fmt_pct(row['directional_accuracy']):>20}"
        )
    print()
    print(report["verdict"]["summary"].replace("**", ""))
    print()


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Evaluate the LSTM prediction checkpoint against baselines."
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL_PATH, help="Path to the .pt checkpoint"
    )
    parser.add_argument(
        "--sentiment-csv",
        default=DEFAULT_SENTIMENT_CSV,
        help="Path to the sentiment CSV used in training",
    )
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--interval", default="1h")
    parser.add_argument(
        "--train-fraction",
        type=float,
        default=0.8,
        help="Fraction of the series used for training",
    )
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="Re-download candles instead of using the cache",
    )
    parser.add_argument(
        "--no-plot", action="store_true", help="Skip the predicted-vs-actual chart"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    report = run_evaluation(
        model_path=args.model,
        sentiment_csv=args.sentiment_csv,
        symbol=args.symbol,
        interval=args.interval,
        train_fraction=args.train_fraction,
        use_cache=not args.refresh_cache,
        make_plot=not args.no_plot,
    )
    print_table(report)


if __name__ == "__main__":
    main()
