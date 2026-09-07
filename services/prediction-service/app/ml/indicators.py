"""
Technical indicator feature engineering.

Deliberately free of torch: these are pure numpy functions, and keeping them
out of model_manager means they can be imported - and unit tested - without
pulling in the ML runtime.
"""


import numpy as np


class TechnicalIndicatorCalculator:
    """
    Calculate technical indicators required by the model.

    Features from notebook:
    - log_ret: Log return (ln(close_t / close_t-1))
    - volume_log: Log of volume
    - sentiment: Sentiment score
    - rsi: RSI indicator (14 periods)
    - macd: MACD difference
    - bb_width: Bollinger Bands width
    """

    @staticmethod
    def calculate_rsi(closes: np.ndarray, window: int = 14) -> float:
        """Calculate RSI for the latest data point."""
        if len(closes) < window + 1:
            return 50.0  # Neutral default

        deltas = np.diff(closes)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)

        # Use simple moving average for calculation
        avg_gain = np.mean(gains[-window:])
        avg_loss = np.mean(losses[-window:])

        if avg_loss == 0:
            return 100.0

        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return rsi

    @staticmethod
    def calculate_macd(
        closes: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9
    ) -> float:
        """Calculate MACD difference for the latest data point."""
        if len(closes) < slow + signal:
            return 0.0

        # Calculate EMAs
        def ema(data, period):
            alpha = 2 / (period + 1)
            ema_values = [data[0]]
            for price in data[1:]:
                ema_values.append(alpha * price + (1 - alpha) * ema_values[-1])
            return np.array(ema_values)

        ema_fast = ema(closes, fast)
        ema_slow = ema(closes, slow)

        macd_line = ema_fast - ema_slow
        signal_line = ema(macd_line, signal)

        # MACD histogram (difference)
        macd_diff = macd_line[-1] - signal_line[-1]
        return macd_diff

    @staticmethod
    def calculate_bollinger_width(
        closes: np.ndarray, window: int = 20, num_std: float = 2
    ) -> float:
        """Calculate Bollinger Bands width for the latest data point."""
        if len(closes) < window:
            return 0.0

        recent = closes[-window:]
        sma = np.mean(recent)
        std = np.std(recent)

        upper = sma + num_std * std
        lower = sma - num_std * std

        # Width as percentage
        if sma > 0:
            width = (upper - lower) / sma
        else:
            width = 0.0

        return width

    @classmethod
    def calculate_features(
        cls,
        price_buffer: list[dict],
        sentiment: float = 0.0
    ) -> np.ndarray | None:
        """
        Calculate all features required by the model.

        Features order (from notebook):
        ['log_ret', 'volume_log', 'sentiment', 'rsi', 'macd', 'bb_width']

        Args:
            price_buffer: List of OHLCV dicts (must have at least 50 entries for indicators)
            sentiment: Current sentiment score

        Returns:
            Feature matrix (window_size, num_features) or None if insufficient data
        """
        if len(price_buffer) < 50:  # Need enough data for indicators
            return None

        closes = np.array([float(d.get("close", 0)) for d in price_buffer])
        volumes = np.array([float(d.get("volume", 0)) for d in price_buffer])

        # Calculate features for each time step
        features_list = []

        # We need to calculate features for each position in the window
        # Start from position 26 (to have enough data for MACD slow period)
        for i in range(26, len(price_buffer)):
            closes_up_to_i = closes[:i+1]

            # Log return
            if closes[i-1] > 0:
                log_ret = np.log(closes[i] / closes[i-1])
            else:
                log_ret = 0.0

            # Volume log
            volume_log = np.log1p(volumes[i])

            # RSI
            rsi = cls.calculate_rsi(closes_up_to_i, window=14)

            # MACD
            macd = cls.calculate_macd(closes_up_to_i)

            # Bollinger Width
            bb_width = cls.calculate_bollinger_width(closes_up_to_i, window=20)

            # Feature row: ['log_ret', 'volume_log', 'sentiment', 'rsi', 'macd', 'bb_width']
            features_list.append([
                log_ret,
                volume_log,
                sentiment,
                rsi,
                macd,
                bb_width
            ])

        return np.array(features_list, dtype=np.float32)

