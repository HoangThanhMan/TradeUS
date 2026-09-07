"""
Unit tests for TechnicalIndicatorCalculator.

These are the pure functions behind every prediction — feature values go
straight into the model, so a silent change here shifts every signal the
platform emits. They need no model, no network and no database, which makes
them the right thing to gate CI on.
"""

import numpy as np
import pytest

from app.ml.model_manager import TechnicalIndicatorCalculator as Calc


def rising(n=60, start=100.0, step=1.0):
    """A strictly increasing close series."""
    return np.array([start + i * step for i in range(n)], dtype=float)


def falling(n=60, start=160.0, step=1.0):
    """A strictly decreasing close series."""
    return np.array([start - i * step for i in range(n)], dtype=float)


def flat(n=60, value=100.0):
    """A constant close series."""
    return np.full(n, value, dtype=float)


class TestRSI:
    """RSI must stay in range and track direction."""

    def test_all_gains_is_maximal(self):
        """A series that only rises has no losses, so RSI pins at 100."""
        assert Calc.calculate_rsi(rising()) == 100.0

    def test_all_losses_is_minimal(self):
        """A series that only falls should sit at the bottom of the range."""
        assert Calc.calculate_rsi(falling()) == pytest.approx(0.0)

    def test_stays_within_bounds(self):
        """RSI is a bounded oscillator for any input."""
        rng = np.random.default_rng(0)
        for _ in range(20):
            closes = 100 + np.cumsum(rng.normal(0, 2, 80))
            assert 0.0 <= Calc.calculate_rsi(closes) <= 100.0

    def test_neutral_default_when_data_is_short(self):
        """Too few candles must return the neutral default, not raise."""
        assert Calc.calculate_rsi(np.array([100.0, 101.0])) == 50.0

    def test_rising_scores_above_falling(self):
        """The whole point of RSI: direction has to move the number."""
        assert Calc.calculate_rsi(rising()) > Calc.calculate_rsi(falling())


class TestMACD:
    """MACD histogram sign should follow momentum."""

    def test_zero_when_price_is_flat(self):
        """No trend means no divergence between the EMAs."""
        assert Calc.calculate_macd(flat()) == pytest.approx(0.0, abs=1e-9)

    def test_zero_default_when_data_is_short(self):
        """Below the slow+signal window there is nothing to compute."""
        assert Calc.calculate_macd(np.array([100.0, 101.0, 102.0])) == 0.0

    def test_uptrend_and_downtrend_have_opposite_signs(self):
        """A sustained trend must produce a histogram of the matching sign."""
        assert Calc.calculate_macd(rising()) > 0
        assert Calc.calculate_macd(falling()) < 0


class TestBollingerWidth:
    """Bollinger width measures volatility, and its scale matters."""

    def test_zero_when_price_is_flat(self):
        """No dispersion means no band width."""
        assert Calc.calculate_bollinger_width(flat()) == pytest.approx(0.0)

    def test_widens_with_volatility(self):
        """A noisier series must produce a wider band."""
        rng = np.random.default_rng(1)
        calm = 100 + rng.normal(0, 0.5, 60)
        wild = 100 + rng.normal(0, 5.0, 60)

        assert Calc.calculate_bollinger_width(wild) > Calc.calculate_bollinger_width(
            calm
        )

    def test_zero_default_when_data_is_short(self):
        """Fewer candles than the window returns the default."""
        assert Calc.calculate_bollinger_width(np.array([100.0, 101.0])) == 0.0

    def test_returns_a_fraction_not_a_percentage(self):
        """
        Pins the known train/serve scale mismatch.

        This function returns ``(upper - lower) / sma`` — a fraction — while the
        model was trained on ``ta.BollingerBands.bollinger_wband()``, which is
        the same quantity times 100. See
        ``services/prediction-service/eval/report.md``.

        The assertion documents current behaviour so the discrepancy cannot be
        "fixed" on one side without this test failing and forcing the model to
        be retrained or the serving path rescaled to match.
        """
        rng = np.random.default_rng(2)
        closes = 100 + rng.normal(0, 2, 60)

        width = Calc.calculate_bollinger_width(closes)
        sma = float(np.mean(closes[-20:]))
        std = float(np.std(closes[-20:]))
        expected_fraction = (4 * std) / sma  # (sma+2s) - (sma-2s) = 4s

        assert width == pytest.approx(expected_fraction)
        assert width < 1.0, "still a fraction; the trained model expects x100"


class TestFeatureMatrix:
    """calculate_features assembles what actually reaches the model."""

    @staticmethod
    def buffer(n=80):
        """An OHLCV buffer shaped like the price buffer the service keeps."""
        rng = np.random.default_rng(3)
        closes = 100 + np.cumsum(rng.normal(0, 1, n))
        return [
            {"close": float(c), "volume": float(1000 + i)}
            for i, c in enumerate(closes)
        ]

    def test_returns_none_when_buffer_is_too_small(self):
        """Under 50 candles there is not enough history for the indicators."""
        assert Calc.calculate_features([{"close": 1.0, "volume": 1.0}] * 10) is None

    def test_column_count_matches_the_model_input(self):
        """
        Six features, in the order the checkpoint was trained on.

        A change here silently feeds the LSTM shuffled inputs, which produces
        confident nonsense rather than an error.
        """
        features = Calc.calculate_features(self.buffer())

        assert features is not None
        assert features.shape[1] == 6

    def test_sentiment_is_broadcast_into_every_row(self):
        """The service caches one sentiment per symbol and reuses it."""
        features = Calc.calculate_features(self.buffer(), sentiment=0.42)

        assert np.allclose(features[:, 2], 0.42)

    def test_row_count_accounts_for_the_macd_warmup(self):
        """Rows start at index 26, the MACD slow period."""
        buffer = self.buffer(80)

        features = Calc.calculate_features(buffer)

        assert len(features) == len(buffer) - 26

    def test_output_is_finite(self):
        """NaN or inf reaching the scaler poisons every downstream prediction."""
        features = Calc.calculate_features(self.buffer())

        assert np.all(np.isfinite(features))
