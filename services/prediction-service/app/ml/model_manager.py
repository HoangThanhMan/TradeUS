"""
ML Model management module.
Handles loading, inference and management of LSTM prediction models.
Compatible with train_v3.ipynb notebook architecture.
"""

import logging
import os
from typing import Optional, Any
from collections import deque
from datetime import datetime

import numpy as np
import torch
import torch.nn as nn

from app.config import settings

logger = logging.getLogger(__name__)


class CryptoPredictor(nn.Module):
    """
    LSTM-based model for cryptocurrency price prediction.
    Must match the architecture defined in train_v3.ipynb notebook.
    
    Architecture:
    - LSTM layers with configurable hidden dimensions
    - Dropout for regularization
    - Linear output layer for log return prediction
    """

    def __init__(
        self,
        input_dim: int,
        hidden_dim: int,
        num_layers: int,
        output_dim: int = 1,
        dropout: float = 0.2,
    ):
        super(CryptoPredictor, self).__init__()

        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.output_dim = output_dim
        self.dropout = dropout

        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )

        self.fc = nn.Linear(hidden_dim, output_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass through the network."""
        # x shape: (Batch, Seq_Len, Features)
        out, _ = self.lstm(x)

        # Take output at the last time step
        last_out = out[:, -1, :]
        prediction = self.fc(last_out)
        return prediction


class RobustScalerReconstructor:
    """
    Reconstruct RobustScaler from saved parameters.
    Compatible with sklearn's RobustScaler.
    
    RobustScaler formula:
    - transform: (X - center) / scale
    - inverse_transform: X * scale + center
    """

    def __init__(self, scaler_params: dict):
        """
        Initialize from saved scaler parameters.
        
        Args:
            scaler_params: Dict with 'center' and 'scale' arrays
        """
        self.center_ = np.array(scaler_params["center"])
        self.scale_ = np.array(scaler_params["scale"])

    def transform(self, X: np.ndarray) -> np.ndarray:
        """Transform data using loaded scaler parameters."""
        X = np.asarray(X)
        return (X - self.center_) / self.scale_

    def inverse_transform(self, X: np.ndarray) -> np.ndarray:
        """Inverse transform data back to original scale."""
        X = np.asarray(X)
        return X * self.scale_ + self.center_


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
    def calculate_macd(closes: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9) -> float:
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
    def calculate_bollinger_width(closes: np.ndarray, window: int = 20, num_std: float = 2) -> float:
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
    ) -> Optional[np.ndarray]:
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


class ModelManager:
    """
    Manages ML model lifecycle including loading, inference, and price buffer management.
    Compatible with train_v3.ipynb notebook output.
    """

    def __init__(self):
        self.model: Optional[CryptoPredictor] = None
        self.scaler_X: Optional[RobustScalerReconstructor] = None
        self.scaler_y: Optional[RobustScalerReconstructor] = None
        self.feature_cols: list[str] = []
        self.window_size: int = 24
        self.device: torch.device = torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        self.extra_info: dict = {}
        self.is_loaded: bool = False

        # Price buffer for each symbol
        # Structure: {symbol: {interval: deque([{ohlcv data}])}}
        self.price_buffers: dict[str, dict[str, deque]] = {}

        # Latest sentiment for each symbol
        self.sentiment_cache: dict[str, float] = {}
        
        # Technical indicator calculator
        self.indicator_calc = TechnicalIndicatorCalculator()

    def load_model(self, model_path: str = None) -> bool:
        """
        Load model from checkpoint file.
        
        Expected checkpoint structure (from train_v3.ipynb):
        - model_config: dict with input_dim, hidden_dim, num_layers, output_dim, dropout
        - model_state_dict: PyTorch state dict
        - feature_cols: list of feature column names
        - window_size: int
        - scaler_X_params: dict with 'center' and 'scale'
        - scaler_y_params: dict with 'center' and 'scale'
        - extra_info: optional dict with training info (e.g., rmse)

        Args:
            model_path: Path to the model checkpoint file.

        Returns:
            True if loaded successfully, False otherwise.
        """
        if model_path is None:
            model_path = settings.model_path

        # Check if path is relative, make it relative to project root directory
        if not os.path.isabs(model_path):
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            model_path = os.path.join(base_dir, model_path)

        if not os.path.exists(model_path):
            logger.warning(f"Model file not found: {model_path}")
            return False

        try:
            logger.info(f"Loading model from: {model_path}")
            checkpoint = torch.load(
                model_path, map_location=self.device, weights_only=False
            )

            # Recreate model from config
            config = checkpoint["model_config"]
            self.model = CryptoPredictor(
                input_dim=config["input_dim"],
                hidden_dim=config["hidden_dim"],
                num_layers=config["num_layers"],
                output_dim=config["output_dim"],
                dropout=config["dropout"],
            )

            self.model.load_state_dict(checkpoint["model_state_dict"])
            self.model.to(self.device)
            self.model.eval()

            # Load RobustScalers (train_v3.ipynb format)
            if "scaler_X_params" in checkpoint:
                self.scaler_X = RobustScalerReconstructor(checkpoint["scaler_X_params"])
                logger.info("Loaded scaler_X from scaler_X_params")
            elif "scaler_X" in checkpoint:
                # Fallback for older format
                self.scaler_X = RobustScalerReconstructor(checkpoint["scaler_X"])
                logger.info("Loaded scaler_X from scaler_X (legacy format)")
                
            if "scaler_y_params" in checkpoint:
                self.scaler_y = RobustScalerReconstructor(checkpoint["scaler_y_params"])
                logger.info("Loaded scaler_y from scaler_y_params")
            elif "scaler_y" in checkpoint:
                self.scaler_y = RobustScalerReconstructor(checkpoint["scaler_y"])
                logger.info("Loaded scaler_y from scaler_y (legacy format)")

            # Load metadata
            self.feature_cols = checkpoint.get(
                "feature_cols", 
                ["log_ret", "volume_log", "sentiment", "rsi", "macd", "bb_width"]
            )
            self.window_size = checkpoint.get("window_size", 24)
            self.extra_info = checkpoint.get("extra_info", {})

            self.is_loaded = True
            logger.info(f"Model loaded successfully!")
            logger.info(f"  - Window size: {self.window_size}")
            logger.info(f"  - Features: {self.feature_cols}")
            logger.info(f"  - Device: {self.device}")
            logger.info(f"  - Extra info: {self.extra_info}")

            return True

        except Exception as e:
            logger.error(f"Failed to load model: {e}", exc_info=True)
            return False

    def update_price_buffer(
        self, symbol: str, interval: str, price_data: dict
    ) -> None:
        """
        Update price buffer with new price data.

        Args:
            symbol: Trading symbol (e.g., 'BTCUSDT')
            interval: Time interval (e.g., '1h')
            price_data: Price data dict with open, high, low, close, volume
        """
        if symbol not in self.price_buffers:
            self.price_buffers[symbol] = {}

        if interval not in self.price_buffers[symbol]:
            # Need extra buffer for technical indicator calculation
            # At least 50 candles for proper indicator values
            self.price_buffers[symbol][interval] = deque(
                maxlen=max(settings.price_buffer_size, 100)
            )

        # Add timestamp if not present
        if "timestamp" not in price_data:
            price_data["timestamp"] = datetime.utcnow().isoformat()

        self.price_buffers[symbol][interval].append(price_data)
        logger.debug(
            f"Price buffer updated for {symbol}/{interval}. "
            f"Buffer size: {len(self.price_buffers[symbol][interval])}"
        )

    def update_sentiment(self, symbol: str, sentiment: float) -> None:
        """
        Update sentiment cache for a symbol.

        Args:
            symbol: Trading symbol
            sentiment: Sentiment score (-1 to 1)
        """
        self.sentiment_cache[symbol] = sentiment
        logger.debug(f"Sentiment updated for {symbol}: {sentiment}")

    def get_sentiment(self, symbol: str) -> float:
        """Get current sentiment for a symbol, default to 0 (neutral)."""
        return self.sentiment_cache.get(symbol, 0.0)

    def can_predict(self, symbol: str, interval: str) -> bool:
        """
        Check if we have enough data to make a prediction.
        
        Requires:
        - Model loaded
        - At least (window_size + 26) candles for indicators + window
        """
        if not self.is_loaded:
            return False

        if symbol not in self.price_buffers:
            return False

        if interval not in self.price_buffers[symbol]:
            return False

        # Need extra data for indicator calculation (26 for MACD slow period)
        min_required = self.window_size + 26
        return len(self.price_buffers[symbol][interval]) >= min_required

    def predict(self, symbol: str, interval: str) -> Optional[dict[str, Any]]:
        """
        Make a price prediction for the given symbol and interval.
        
        The model predicts log return for the next period.
        Price reconstruction: Price_t+1 = Price_t * exp(Log_Return)

        Args:
            symbol: Trading symbol
            interval: Time interval

        Returns:
            Prediction result dict or None if prediction fails
        """
        if not self.can_predict(symbol, interval):
            logger.warning(f"Cannot predict for {symbol}/{interval}: insufficient data")
            return None

        try:
            # Get price buffer
            buffer = list(self.price_buffers[symbol][interval])
            
            # Get current sentiment
            sentiment = self.get_sentiment(symbol)
            
            # Calculate technical indicators and features
            all_features = self.indicator_calc.calculate_features(buffer, sentiment)
            
            if all_features is None or len(all_features) < self.window_size:
                logger.warning(f"Insufficient features calculated for {symbol}/{interval}")
                return None
            
            # Get the last window_size features
            window_features = all_features[-self.window_size:]

            # Scale features
            if self.scaler_X:
                window_features = self.scaler_X.transform(window_features)

            # Convert to tensor and add batch dimension
            X = torch.FloatTensor(window_features).unsqueeze(0).to(self.device)

            # Inference - model predicts scaled log return
            with torch.no_grad():
                pred_scaled = self.model(X).cpu().numpy()

            # Inverse transform to get raw log return
            if self.scaler_y:
                pred_log_ret = self.scaler_y.inverse_transform(pred_scaled)[0][0]
            else:
                pred_log_ret = pred_scaled[0][0]

            # Get current price (last close in buffer)
            current_price = float(buffer[-1].get("close", 0))

            # Price reconstruction: Price_t+1 = Price_t * exp(Log_Return)
            predicted_price = current_price * np.exp(pred_log_ret)

            # Calculate price change
            price_change = predicted_price - current_price
            price_change_pct = (price_change / current_price * 100) if current_price > 0 else 0

            # Determine signal based on prediction
            if price_change_pct > 1.5:
                signal = "STRONG_BUY"
                signal_color = "#00c853"  # Green
                message = "🚀 Price is expected to rise strongly"
            elif price_change_pct > 0.5:
                signal = "BUY"
                signal_color = "#69f0ae"  # Light green
                message = "📈 Price shows an upward trend"
            elif price_change_pct < -1.5:
                signal = "STRONG_SELL"
                signal_color = "#ff1744"  # Red
                message = "⚠️ Price is expected to drop sharply"
            elif price_change_pct < -0.5:
                signal = "SELL"
                signal_color = "#ff8a80"  # Light red
                message = "📉 Price shows a downward trend"
            else:
                signal = "HOLD"
                signal_color = "#9e9e9e"  # Gray
                message = "➡️ Price is expected to remain stable"

            result = {
                "symbol": symbol,
                "interval": interval,
                "current_price": round(current_price, 2),
                "predicted_price": round(float(predicted_price), 2),
                "price_change": round(price_change, 2),
                "price_change_percent": round(price_change_pct, 4),
                "predicted_log_return": round(float(pred_log_ret), 6),
                "signal": signal,
                "signal_color": signal_color,
                "message": message,
                "sentiment": round(sentiment, 4),
                "timestamp": datetime.utcnow().isoformat(),
                "model_info": {
                    "window_size": self.window_size,
                    "buffer_size": len(buffer),
                    "features": self.feature_cols,
                    "rmse": self.extra_info.get("rmse", "N/A"),
                },
            }

            logger.info(
                f"Prediction for {symbol}/{interval}: "
                f"${current_price:.2f} -> ${predicted_price:.2f} ({price_change_pct:+.2f}%) "
                f"[log_ret: {pred_log_ret:.6f}]"
            )

            return result

        except Exception as e:
            logger.error(f"Prediction failed for {symbol}/{interval}: {e}", exc_info=True)
            return None

    def get_buffer_status(self) -> dict:
        """Get status of all price buffers."""
        status = {}
        min_required = self.window_size + 26
        
        for symbol, intervals in self.price_buffers.items():
            status[symbol] = {}
            for interval, buffer in intervals.items():
                status[symbol][interval] = {
                    "size": len(buffer),
                    "required": min_required,
                    "ready": len(buffer) >= min_required,
                }
        return status


# Singleton instance
model_manager = ModelManager()
