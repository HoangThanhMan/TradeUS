"""
ML module for prediction service.

Everything torch-backed is resolved lazily. Importing a torch-free member of
this package - app.ml.indicators, say - must not drag the ML runtime in with
it, which is what lets the indicator unit tests run without torch installed.
"""

from typing import Any

from app.ml.indicators import TechnicalIndicatorCalculator

__all__ = [
    "TechnicalIndicatorCalculator",
    "model_manager",
    "ModelManager",
    "CryptoPredictor",
]

_LAZY = {"model_manager", "ModelManager", "CryptoPredictor"}


def __getattr__(name: str) -> Any:
    if name in _LAZY:
        from app.ml import model_manager as _mm

        return getattr(_mm, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
