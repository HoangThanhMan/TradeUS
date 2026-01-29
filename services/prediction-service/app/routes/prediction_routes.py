"""
Prediction routes for REST API endpoints.
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.ml import model_manager
from app.config import settings
from app.services import get_sentiment_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/predictions", tags=["Predictions"])


class PredictionResponse(BaseModel):
    """Response model for prediction endpoint."""
    
    symbol: str
    interval: str
    current_price: float
    predicted_price: float
    price_change: float
    price_change_percent: float
    predicted_log_return: float  # Log return predicted by model
    signal: str
    signal_color: str
    message: str
    sentiment: float
    timestamp: str
    model_info: dict


class BufferStatusResponse(BaseModel):
    """Response model for buffer status."""
    
    model_loaded: bool
    buffers: dict


class ModelInfoResponse(BaseModel):
    """Response model for model info."""
    
    loaded: bool
    window_size: int
    feature_cols: list[str]
    device: str
    extra_info: dict


@router.get("/predict", response_model=PredictionResponse)
async def get_prediction(
    symbol: str = Query(default="BTCUSDT", description="Trading symbol"),
    interval: str = Query(default="1h", description="Time interval"),
):
    """
    Get price prediction for the specified symbol and interval.
    
    - **symbol**: Trading pair symbol (e.g., BTCUSDT, ETHUSDT)
    - **interval**: Time interval (e.g., 1h, 4h, 1d)
    
    Returns prediction with current price, predicted price, change percentage,
    trading signal, and sentiment score.
    """
    if not model_manager.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Please try again later."
        )
    
    symbol = symbol.upper()
    
    if not model_manager.can_predict(symbol, interval):
        buffer_status = model_manager.get_buffer_status()
        current_size = 0
        
        if symbol in buffer_status and interval in buffer_status[symbol]:
            current_size = buffer_status[symbol][interval]["size"]
        
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Insufficient data for prediction",
                "symbol": symbol,
                "interval": interval,
                "current_buffer_size": current_size,
                "required_size": model_manager.window_size,
                "message": f"Need {model_manager.window_size} candles, have {current_size}"
            }
        )
    
    # Fetch latest sentiment from sentiment-service before prediction
    try:
        sentiment_client = get_sentiment_client()
        sentiment_data = await sentiment_client.get_latest_sentiment(symbol)
        if sentiment_data:
            sentiment = float(sentiment_data.get("sentiment", 0.0))
            model_manager.update_sentiment(symbol, sentiment)
            logger.debug(f"Updated sentiment for {symbol}: {sentiment}")
    except Exception as e:
        logger.warning(f"Failed to fetch sentiment for {symbol}: {e}, using cached/default value")
    
    prediction = model_manager.predict(symbol, interval)
    
    if prediction is None:
        raise HTTPException(
            status_code=500,
            detail="Prediction failed. Please try again."
        )
    
    return PredictionResponse(**prediction)


@router.get("/buffer-status", response_model=BufferStatusResponse)
async def get_buffer_status():
    """
    Get the status of all price buffers.
    
    Returns information about how much data is available for each symbol/interval.
    """
    return BufferStatusResponse(
        model_loaded=model_manager.is_loaded,
        buffers=model_manager.get_buffer_status(),
    )


@router.get("/model-info", response_model=ModelInfoResponse)
async def get_model_info():
    """
    Get information about the loaded model.
    
    Returns model configuration and metadata.
    """
    return ModelInfoResponse(
        loaded=model_manager.is_loaded,
        window_size=model_manager.window_size,
        feature_cols=model_manager.feature_cols,
        device=str(model_manager.device),
        extra_info=model_manager.extra_info,
    )


@router.post("/update-sentiment")
async def update_sentiment(
    symbol: str = Query(..., description="Trading symbol"),
    sentiment: float = Query(..., ge=-1, le=1, description="Sentiment score"),
):
    """
    Manually update sentiment for a symbol.
    
    Useful for testing or manual overrides.
    """
    symbol = symbol.upper()
    model_manager.update_sentiment(symbol, sentiment)
    
    return {
        "status": "success",
        "symbol": symbol,
        "sentiment": sentiment,
    }


@router.get("/symbols")
async def get_available_symbols():
    """
    Get list of symbols with available data.
    """
    buffer_status = model_manager.get_buffer_status()
    
    symbols = []
    for symbol, intervals in buffer_status.items():
        for interval, status in intervals.items():
            symbols.append({
                "symbol": symbol,
                "interval": interval,
                "ready": status["ready"],
                "buffer_size": status["size"],
                "required_size": status["required"],
            })
    
    return {
        "symbols": symbols,
        "model_loaded": model_manager.is_loaded,
    }
