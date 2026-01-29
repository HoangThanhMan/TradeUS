"""
Services module for Prediction Service.
"""

from app.services.sentiment_client import SentimentClient, get_sentiment_client

__all__ = ["SentimentClient", "get_sentiment_client"]
