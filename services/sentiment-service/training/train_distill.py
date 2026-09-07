"""
LoRA fine-tune of a small encoder as a local student for the sentiment pipeline.

Starts from a checkpoint already tuned on a public financial-sentiment corpus
(Financial PhraseBank via ``mrm8488/distilroberta-finetuned-financial-news-
sentiment-analysis``) and runs a domain-adaptation pass on the labels the
platform has produced for itself. Two heads sit on the shared encoder:

  - a regression head for the continuous -1..+1 sentiment score, and
  - a 6-way classification head for the emotion label.

Only the LoRA adapters and the two heads are trained; the base encoder is
frozen. That is what keeps this a few-minutes-on-CPU job and what backs the
"LoRA cut trainable parameters to X%" claim -- the script prints the real
number rather than an estimate.

The training data comes from ``eval/export_training_data.py``, which holds out
the workstream-2 eval set so the student-vs-human comparison stays honest.

Usage:
    cd services/sentiment-service
    python -m training.train_distill
    python -m training.train_distill --epochs 12 --lora-r 8
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import os
import random
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

from app.ml.local_model import EMOTIONS, build_student_class

logger = logging.getLogger(__name__)

# The architecture lives in the service (app/ml/local_model.py) so that a saved
# adapter can never be loaded back into a class that has drifted from the one it
# was trained with.
DualHeadStudent = build_student_class()

TRAINING_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_DIR = os.path.dirname(TRAINING_DIR)
DEFAULT_DATA_DIR = os.path.join(TRAINING_DIR, "data")
DEFAULT_OUTPUT_DIR = os.path.join(TRAINING_DIR, "artifacts")

DEFAULT_BASE_MODEL = "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis"

EMOTION_TO_ID = {name: i for i, name in enumerate(EMOTIONS)}


@dataclass
class TrainConfig:
    """Everything that defines a training run, saved alongside the adapter."""

    base_model: str = DEFAULT_BASE_MODEL
    max_length: int = 256
    epochs: int = 10
    batch_size: int = 8
    learning_rate: float = 3e-4
    weight_decay: float = 0.01
    warmup_ratio: float = 0.1
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    lora_target_modules: tuple[str, ...] = ("query", "value")
    regression_weight: float = 1.0
    emotion_weight: float = 1.0
    seed: int = 20260218


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


class SentimentDataset(Dataset):
    """Tokenised (text, score, emotion) triples exported from MongoDB."""

    def __init__(self, rows: list[dict[str, Any]], tokenizer, max_length: int):
        self.rows = rows
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        row = self.rows[index]
        encoded = self.tokenizer(
            row["text"],
            truncation=True,
            max_length=self.max_length,
            padding="max_length",
            return_tensors="pt",
        )
        return {
            "input_ids": encoded["input_ids"].squeeze(0),
            "attention_mask": encoded["attention_mask"].squeeze(0),
            "sentiment_score": torch.tensor(
                float(row["sentiment_score"]), dtype=torch.float
            ),
            "emotion_id": torch.tensor(
                EMOTION_TO_ID.get(row["emotion"], EMOTION_TO_ID["Optimism"]),
                dtype=torch.long,
            ),
        }


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


def load_jsonl(path: str) -> list[dict[str, Any]]:
    """Read a JSONL export produced by eval/export_training_data.py."""
    if not os.path.exists(path):
        raise SystemExit(
            f"Missing {path}. Run `python -m eval.export_training_data` first."
        )
    with open(path, encoding="utf-8") as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    if not rows:
        raise SystemExit(f"{path} is empty.")
    return rows


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------


def build_model(config: TrainConfig) -> tuple[DualHeadStudent, Any, dict[str, Any]]:
    """Load the base checkpoint, wrap it in LoRA, and attach the two heads."""
    from peft import LoraConfig, TaskType, get_peft_model
    from transformers import AutoModel, AutoTokenizer

    logger.info("Loading base checkpoint: %s", config.base_model)
    tokenizer = AutoTokenizer.from_pretrained(config.base_model)
    base_encoder = AutoModel.from_pretrained(config.base_model)

    total_base_params = sum(p.numel() for p in base_encoder.parameters())

    lora_config = LoraConfig(
        task_type=TaskType.FEATURE_EXTRACTION,
        r=config.lora_r,
        lora_alpha=config.lora_alpha,
        lora_dropout=config.lora_dropout,
        target_modules=list(config.lora_target_modules),
        bias="none",
    )
    encoder = get_peft_model(base_encoder, lora_config)

    hidden_size = base_encoder.config.hidden_size
    model = DualHeadStudent(encoder, hidden_size, len(EMOTIONS))

    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    head_params = sum(
        p.numel()
        for p in list(model.regression_head.parameters())
        + list(model.emotion_head.parameters())
    )

    param_stats = {
        "base_encoder_params": total_base_params,
        "total_params": total,
        "trainable_params": trainable,
        "trainable_percent": trainable / total * 100,
        "lora_params": trainable - head_params,
        "head_params": head_params,
    }
    logger.info(
        "Trainable: %s / %s params (%.3f%%) — LoRA %s + heads %s",
        f"{trainable:,}",
        f"{total:,}",
        param_stats["trainable_percent"],
        f"{param_stats['lora_params']:,}",
        f"{head_params:,}",
    )
    return model, tokenizer, param_stats


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------


def set_seed(seed: int) -> None:
    """Seed every RNG the run touches."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


@torch.no_grad()
def evaluate(
    model: DualHeadStudent,
    loader: DataLoader,
    device: torch.device,
    config: TrainConfig,
) -> dict[str, float]:
    """Score the validation split: loss, regression MAE, emotion accuracy."""
    model.eval()
    mse_fn = nn.MSELoss(reduction="sum")
    ce_fn = nn.CrossEntropyLoss(reduction="sum")

    total_loss = 0.0
    total_abs_error = 0.0
    emotion_hits = 0
    n = 0
    preds: list[float] = []
    targets: list[float] = []

    for batch in loader:
        input_ids = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)
        scores = batch["sentiment_score"].to(device)
        emotion_ids = batch["emotion_id"].to(device)

        pred_score, emotion_logits = model(input_ids, attention_mask)

        loss = config.regression_weight * mse_fn(
            pred_score, scores
        ) + config.emotion_weight * ce_fn(emotion_logits, emotion_ids)

        total_loss += loss.item()
        total_abs_error += torch.abs(pred_score - scores).sum().item()
        emotion_hits += (emotion_logits.argmax(dim=-1) == emotion_ids).sum().item()
        n += scores.size(0)

        preds.extend(pred_score.cpu().tolist())
        targets.extend(scores.cpu().tolist())

    metrics = {
        "loss": total_loss / max(n, 1),
        "mae": total_abs_error / max(n, 1),
        "emotion_accuracy": emotion_hits / max(n, 1),
    }

    # Spearman needs at least a little variance on both sides to mean anything.
    if len(preds) > 2 and len(set(targets)) > 1:
        metrics["spearman"] = float(spearman(preds, targets))
    return metrics


def spearman(a: list[float], b: list[float]) -> float:
    """Spearman rank correlation, implemented here to avoid a scipy dependency."""

    def ranks(values: list[float]) -> list[float]:
        order = sorted(range(len(values)), key=lambda i: values[i])
        out = [0.0] * len(values)
        i = 0
        while i < len(order):
            j = i
            while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
                j += 1
            average_rank = (i + j) / 2 + 1
            for k in range(i, j + 1):
                out[order[k]] = average_rank
            i = j + 1
        return out

    ra, rb = ranks(a), ranks(b)
    mean_a = sum(ra) / len(ra)
    mean_b = sum(rb) / len(rb)
    cov = sum((x - mean_a) * (y - mean_b) for x, y in zip(ra, rb, strict=True))
    var_a = math.sqrt(sum((x - mean_a) ** 2 for x in ra))
    var_b = math.sqrt(sum((y - mean_b) ** 2 for y in rb))
    return cov / (var_a * var_b) if var_a and var_b else 0.0


def train(
    model: DualHeadStudent,
    train_loader: DataLoader,
    val_loader: DataLoader,
    device: torch.device,
    config: TrainConfig,
) -> tuple[list[dict[str, Any]], int]:
    """
    Run the training loop and leave the model on its best-validation weights.

    With a few hundred rows the run overfits well before the last epoch, so
    keeping the final weights would ship the worst checkpoint of the run.
    Only the trainable tensors are snapshotted -- the frozen base encoder never
    changes, so there is nothing else to restore.

    Returns the per-epoch history and the epoch whose weights were kept.
    """
    from torch.optim import AdamW

    trainable = [p for p in model.parameters() if p.requires_grad]
    optimizer = AdamW(
        trainable, lr=config.learning_rate, weight_decay=config.weight_decay
    )

    total_steps = max(len(train_loader) * config.epochs, 1)
    warmup_steps = int(total_steps * config.warmup_ratio)

    def lr_lambda(step: int) -> float:
        if step < warmup_steps:
            return step / max(warmup_steps, 1)
        progress = (step - warmup_steps) / max(total_steps - warmup_steps, 1)
        return max(0.0, 1.0 - progress)

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)
    mse_fn = nn.MSELoss()
    ce_fn = nn.CrossEntropyLoss()

    def snapshot() -> dict[str, torch.Tensor]:
        """Copy the trainable tensors (LoRA adapters + heads) off the device."""
        return {
            name: param.detach().cpu().clone()
            for name, param in model.named_parameters()
            if param.requires_grad
        }

    best_val_loss = float("inf")
    best_epoch = 0
    best_state: dict[str, torch.Tensor] = {}

    history: list[dict[str, Any]] = []
    for epoch in range(1, config.epochs + 1):
        model.train()
        epoch_loss = 0.0
        epoch_reg = 0.0
        epoch_emo = 0.0

        for batch in train_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            scores = batch["sentiment_score"].to(device)
            emotion_ids = batch["emotion_id"].to(device)

            optimizer.zero_grad()
            pred_score, emotion_logits = model(input_ids, attention_mask)

            regression_loss = mse_fn(pred_score, scores)
            emotion_loss = ce_fn(emotion_logits, emotion_ids)
            loss = (
                config.regression_weight * regression_loss
                + config.emotion_weight * emotion_loss
            )

            loss.backward()
            torch.nn.utils.clip_grad_norm_(trainable, 1.0)
            optimizer.step()
            scheduler.step()

            epoch_loss += loss.item()
            epoch_reg += regression_loss.item()
            epoch_emo += emotion_loss.item()

        n_batches = max(len(train_loader), 1)
        val_metrics = evaluate(model, val_loader, device, config)

        record = {
            "epoch": epoch,
            "train_loss": epoch_loss / n_batches,
            "train_regression_loss": epoch_reg / n_batches,
            "train_emotion_loss": epoch_emo / n_batches,
            "val_loss": val_metrics["loss"],
            "val_mae": val_metrics["mae"],
            "val_emotion_accuracy": val_metrics["emotion_accuracy"],
            "val_spearman": val_metrics.get("spearman"),
            "lr": optimizer.param_groups[0]["lr"],
        }
        history.append(record)

        is_best = record["val_loss"] < best_val_loss
        if is_best:
            best_val_loss = record["val_loss"]
            best_epoch = epoch
            best_state = snapshot()

        logger.info(
            "epoch %2d/%d | train %.4f | val %.4f | val MAE %.4f | emo acc %.1f%%%s",
            epoch,
            config.epochs,
            record["train_loss"],
            record["val_loss"],
            record["val_mae"],
            record["val_emotion_accuracy"] * 100,
            "  <- best" if is_best else "",
        )

    if best_state:
        model.load_state_dict(best_state, strict=False)
        logger.info(
            "Restored epoch %d weights (val loss %.4f) before saving",
            best_epoch,
            best_val_loss,
        )

    return history, best_epoch


# ---------------------------------------------------------------------------
# Artifacts
# ---------------------------------------------------------------------------


def save_loss_curve(
    history: list[dict[str, Any]], path: str, best_epoch: int = 0
) -> str | None:
    """Plot train/val loss per epoch so the run can be eyeballed for sanity."""
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        logger.warning("matplotlib not installed, skipping loss curve")
        return None

    epochs = [h["epoch"] for h in history]
    fig, (ax_loss, ax_metric) = plt.subplots(1, 2, figsize=(12, 4.5))

    ax_loss.plot(epochs, [h["train_loss"] for h in history], label="train", marker="o")
    ax_loss.plot(epochs, [h["val_loss"] for h in history], label="val", marker="o")
    if best_epoch:
        ax_loss.axvline(
            best_epoch, color="green", linestyle="--", alpha=0.6,
            label=f"kept (epoch {best_epoch})",
        )
    ax_loss.set_title("Loss (MSE on score + CE on emotion)")
    ax_loss.set_xlabel("Epoch")
    ax_loss.legend()
    ax_loss.grid(alpha=0.3)

    ax_metric.plot(epochs, [h["val_mae"] for h in history], label="val MAE", marker="o")
    ax_metric.plot(
        epochs,
        [h["val_emotion_accuracy"] for h in history],
        label="val emotion acc",
        marker="o",
    )
    ax_metric.set_title("Validation metrics")
    ax_metric.set_xlabel("Epoch")
    ax_metric.legend()
    ax_metric.grid(alpha=0.3)

    fig.tight_layout()
    fig.savefig(path, dpi=120)
    plt.close(fig)
    logger.info("Saved loss curve to %s", path)
    return path


def save_artifacts(
    model: DualHeadStudent,
    tokenizer,
    config: TrainConfig,
    param_stats: dict[str, Any],
    history: list[dict[str, Any]],
    data_stats: dict[str, Any],
    output_dir: str,
    best_epoch: int,
) -> dict[str, Any]:
    """Write the adapter, the heads, the tokenizer and the run metadata."""
    os.makedirs(output_dir, exist_ok=True)

    adapter_dir = os.path.join(output_dir, "lora_adapter")
    model.encoder.save_pretrained(adapter_dir)
    tokenizer.save_pretrained(adapter_dir)
    logger.info("Saved LoRA adapter to %s", adapter_dir)

    heads_path = os.path.join(output_dir, "heads.pt")
    torch.save(
        {
            "regression_head": model.regression_head.state_dict(),
            "emotion_head": model.emotion_head.state_dict(),
            "emotions": EMOTIONS,
        },
        heads_path,
    )

    curve_path = save_loss_curve(
        history, os.path.join(output_dir, "loss_curve.png"), best_epoch
    )

    best = next(h for h in history if h["epoch"] == best_epoch)
    metadata = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "config": {
            **asdict(config),
            "lora_target_modules": list(config.lora_target_modules),
        },
        "parameters": param_stats,
        "data": data_stats,
        "history": history,
        "best_epoch": best["epoch"],
        "best_val_loss": best["val_loss"],
        "selected": best,
        "final_epoch_metrics": history[-1],
        "artifacts": {
            "lora_adapter": display_path(adapter_dir, SERVICE_DIR),
            "heads": display_path(heads_path, SERVICE_DIR),
            "loss_curve": (
                display_path(curve_path, SERVICE_DIR) if curve_path else None
            ),
        },
    }

    with open(
        os.path.join(output_dir, "training_run.json"), "w", encoding="utf-8"
    ) as fh:
        json.dump(metadata, fh, indent=2)

    with open(os.path.join(output_dir, "report.md"), "w", encoding="utf-8") as fh:
        fh.write(render_report(metadata))

    return metadata


def render_report(metadata: dict[str, Any]) -> str:
    """Render the training run as report.md."""
    config = metadata["config"]
    params = metadata["parameters"]
    data = metadata["data"]
    selected = metadata["selected"]
    final = metadata["final_epoch_metrics"]
    history = metadata["history"]

    lines: list[str] = []
    lines.append("# Sentiment Student — LoRA Training Run")
    lines.append("")
    lines.append(
        f"> Generated by `python -m training.train_distill` on "
        f"{metadata['generated_at']}."
    )
    lines.append("")

    if data.get("teacher_counts", {}).get("mock"):
        mock_n = data["teacher_counts"]["mock"]
        total_n = sum(data["teacher_counts"].values())
        lines.append("## ⚠ Data provenance")
        lines.append("")
        lines.append(
            f"**{mock_n} of {total_n} training rows carry labels from the keyword "
            "fallback in `SentimentService._mock_sentiment_analysis`, not from "
            "Gemini.** This run therefore validates the training pipeline; it does "
            "not produce a distilled LLM. See "
            "`training/data/export_report.md` for how to fix the labels and re-run."
        )
        lines.append("")

    lines.append("## Setup")
    lines.append("")
    lines.append(f"- **Base checkpoint:** `{config['base_model']}`")
    lines.append(
        "  (already fine-tuned on a public financial-sentiment corpus; this run is "
        "a domain-adaptation pass on top, not training from scratch)"
    )
    lines.append(
        f"- **LoRA:** rank {config['lora_r']}, alpha {config['lora_alpha']}, "
        f"dropout {config['lora_dropout']}, targeting "
        f"{', '.join(f'`{m}`' for m in config['lora_target_modules'])}"
    )
    lines.append(
        f"- **Heads:** regression (1 output, tanh to -1..+1) + emotion "
        f"({len(EMOTIONS)}-way classification)"
    )
    lines.append(
        f"- **Schedule:** {config['epochs']} epochs, batch {config['batch_size']}, "
        f"lr {config['learning_rate']}, {int(config['warmup_ratio'] * 100)}% warmup"
    )
    lines.append(
        f"- **Data:** {data['n_train']} train / {data['n_val']} val rows, split "
        "chronologically"
    )
    lines.append(f"- **Device:** {data.get('device', 'cpu')}")
    lines.append("")

    lines.append("## What LoRA bought")
    lines.append("")
    lines.append("| | Params |")
    lines.append("|---|---|")
    lines.append(f"| Full model | {params['total_params']:,} |")
    lines.append(f"| Trainable (LoRA + heads) | {params['trainable_params']:,} |")
    lines.append(f"| &nbsp;&nbsp;of which LoRA adapters | {params['lora_params']:,} |")
    lines.append(f"| &nbsp;&nbsp;of which task heads | {params['head_params']:,} |")
    lines.append(
        f"| **Trainable share** | **{params['trainable_percent']:.2f}%** |"
    )
    lines.append("")
    lines.append(
        f"The frozen base encoder keeps {params['base_encoder_params']:,} parameters "
        "fixed, so only "
        f"{params['trainable_percent']:.2f}% of the model receives gradients. That is "
        "what makes this a CPU-minutes job instead of a GPU-hours one."
    )
    lines.append("")

    lines.append("## Training curve")
    lines.append("")
    lines.append("| Epoch | Train loss | Val loss | Val MAE | Val emotion acc. | |")
    lines.append("|---|---|---|---|---|---|")
    for record in history:
        marker = " **← kept**" if record["epoch"] == selected["epoch"] else ""
        lines.append(
            f"| {record['epoch']} | {record['train_loss']:.4f} "
            f"| {record['val_loss']:.4f} | {record['val_mae']:.4f} "
            f"| {record['val_emotion_accuracy'] * 100:.1f}% |{marker} |"
        )
    lines.append("")
    if selected["epoch"] < len(history):
        lines.append(
            f"Training loss keeps falling to epoch {len(history)} while validation "
            f"loss bottoms at epoch {selected['epoch']} — the run overfits, which is "
            f"what {data['n_train']} training rows buys you. The saved adapter is "
            f"the epoch-{selected['epoch']} checkpoint, not the last one."
        )
        lines.append("")
    if metadata["artifacts"].get("loss_curve"):
        lines.append("![Loss curve](loss_curve.png)")
        lines.append("")

    lines.append("## Saved checkpoint")
    lines.append("")
    lines.append(
        f"| Metric | Selected (epoch {selected['epoch']}) "
        f"| Last epoch ({final['epoch']}) |"
    )
    lines.append("|---|---|---|")
    lines.append(
        f"| Val loss | **{selected['val_loss']:.4f}** | {final['val_loss']:.4f} |"
    )
    lines.append(
        f"| Val MAE (sentiment score) | **{selected['val_mae']:.4f}** "
        f"| {final['val_mae']:.4f} |"
    )
    lines.append(
        f"| Val emotion accuracy | **{selected['val_emotion_accuracy'] * 100:.1f}%** "
        f"| {final['val_emotion_accuracy'] * 100:.1f}% |"
    )
    if selected.get("val_spearman") is not None:
        final_rho = final.get("val_spearman")
        final_cell = f"{final_rho:.3f}" if final_rho is not None else "n/a"
        lines.append(
            f"| Val Spearman (student vs teacher) | **{selected['val_spearman']:.3f}** "
            f"| {final_cell} |"
        )
    lines.append("")
    lines.append(
        f"Emotion accuracy is against a {100 / len(EMOTIONS):.1f}% random baseline "
        f"over {len(EMOTIONS)} classes."
    )
    lines.append("")
    lines.append(
        "These are student-vs-teacher numbers on held-out rows. The number that "
        "actually matters — student vs. human on the workstream-2 labelled set — "
        "is Sprint 2's job (`training/evaluate_distill.py`)."
    )
    lines.append("")

    lines.append("## Artifacts")
    lines.append("")
    for name, path in metadata["artifacts"].items():
        if path:
            lines.append(f"- `{path}` — {name.replace('_', ' ')}")
    lines.append("")

    lines.append("## Reproducing")
    lines.append("")
    lines.append("```bash")
    lines.append("cd services/sentiment-service")
    lines.append("pip install -r training/requirements.txt")
    lines.append("python -m eval.export_training_data --allow-mock-labels")
    lines.append("python -m training.train_distill")
    lines.append("```")
    lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="LoRA fine-tune a local sentiment student on exported labels."
    )
    parser.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--lora-r", type=int, default=16)
    parser.add_argument("--lora-alpha", type=int, default=32)
    parser.add_argument("--seed", type=int, default=20260218)
    parser.add_argument(
        "--device", default=None, help="cpu or cuda (auto-detected by default)"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
    )

    config = TrainConfig(
        base_model=args.base_model,
        max_length=args.max_length,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        seed=args.seed,
    )
    set_seed(config.seed)

    device = torch.device(
        args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    )
    logger.info("Training on %s", device)

    train_rows = load_jsonl(os.path.join(args.data_dir, "train.jsonl"))
    val_rows = load_jsonl(os.path.join(args.data_dir, "val.jsonl"))

    model, tokenizer, param_stats = build_model(config)
    model.to(device)

    train_loader = DataLoader(
        SentimentDataset(train_rows, tokenizer, config.max_length),
        batch_size=config.batch_size,
        shuffle=True,
    )
    val_loader = DataLoader(
        SentimentDataset(val_rows, tokenizer, config.max_length),
        batch_size=config.batch_size,
    )

    history, best_epoch = train(model, train_loader, val_loader, device, config)

    from collections import Counter

    data_stats = {
        "n_train": len(train_rows),
        "n_val": len(val_rows),
        "device": str(device),
        "teacher_counts": dict(
            Counter(r.get("teacher", "unknown") for r in train_rows + val_rows)
        ),
        "train_emotions": dict(Counter(r["emotion"] for r in train_rows)),
    }

    metadata = save_artifacts(
        model,
        tokenizer,
        config,
        param_stats,
        history,
        data_stats,
        args.output_dir,
        best_epoch,
    )

    print()
    print(f"Trainable params : {param_stats['trainable_params']:,} "
          f"({param_stats['trainable_percent']:.2f}% of {param_stats['total_params']:,})")
    print(f"Saved checkpoint : epoch {metadata['best_epoch']} "
          f"(val loss {metadata['best_val_loss']:.4f})")
    print(f"  val MAE        : {metadata['selected']['val_mae']:.4f}")
    print(
        f"  emotion acc    : "
        f"{metadata['selected']['val_emotion_accuracy'] * 100:.1f}%"
    )
    print(f"Artifacts        : {args.output_dir}")
    print()


if __name__ == "__main__":
    main()
