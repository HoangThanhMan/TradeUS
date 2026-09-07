"""
Local sentiment model — the ``SENTIMENT_BACKEND=local`` inference path.

Runs a small encoder on CPU instead of calling the Gemini API. Two variants are
supported, selected by ``LOCAL_MODEL_VARIANT``:

``student``
    The LoRA-adapted dual-head model produced by ``training/train_distill.py``.
    Returns a continuous −1..+1 score *and* one of the six platform emotions.

``base``
    The public financial-sentiment checkpoint with no adapter, read through its
    own 3-class head (negative/neutral/positive) and mapped onto a score. No
    emotion head exists, so emotions are derived from the score.

    This variant exists because `training/report.md` measured it at 66.0%
    bucket accuracy against the hand-labelled set versus the student's 58.0%.
    On the current training data the untrained base is the better local model,
    so the service must be able to choose it.

This module owns the model architecture. ``training/train_distill.py`` imports
``DualHeadStudent`` from here rather than defining its own, so a saved adapter
can never be loaded into a class that has drifted from the one it was trained
with.

Loading is lazy and cached: the first request pays the model load, subsequent
ones do not. Inference is synchronous CPU work, so callers should dispatch it
off the event loop (``asyncio.to_thread``).
"""

from __future__ import annotations

import json
import logging
import os
import threading
from typing import Any

logger = logging.getLogger(__name__)

# The six emotions the platform's schema uses, in the order the trained
# classification head emits them.
EMOTIONS = ["Optimism", "Greed", "Excitement", "Fear", "Anger", "Pessimism"]

# Fallback base checkpoint, used only when the artifacts directory has no
# training_run.json to read the real one from.
DEFAULT_BASE_MODEL = "mrm8488/distilroberta-finetuned-financial-news-sentiment-analysis"

# Maps the base checkpoint's own 3-class labels onto a representative score.
BASE_LABEL_SCORES = {"negative": -0.7, "neutral": 0.0, "positive": 0.7}


def _torch():
    """Import torch lazily so the service starts without the ML extras installed."""
    import torch

    return torch


def emotion_from_score(score: float) -> str:
    """
    Derive an emotion from a bare sentiment score.

    Only used by the ``base`` variant, which has no emotion head. It is a
    deterministic mapping, not a prediction, and the reason string says so.
    """
    if score >= 0.6:
        return "Excitement"
    if score > 0.2:
        return "Optimism"
    if score >= -0.2:
        return "Pessimism" if score < 0 else "Optimism"
    if score > -0.6:
        return "Pessimism"
    return "Fear"


_student_class = None
_student_class_lock = threading.Lock()


def build_student_class():
    """
    Return the ``nn.Module`` class implementing the dual-head student.

    The class is defined inside this function, and cached, so that importing
    this module does not require torch. That matters because the service ships
    without the ML extras unless ``SENTIMENT_BACKEND=local`` is in use, and
    ``app/config.py`` must stay importable either way.
    """
    global _student_class
    if _student_class is not None:
        return _student_class

    with _student_class_lock:
        if _student_class is not None:
            return _student_class

        torch = _torch()
        import torch.nn as nn

        class _DualHeadStudent(nn.Module):
            """
            Mean-pooled encoder with a tanh regression head and an emotion head.

            Mean pooling over unmasked tokens rather than the CLS vector: with a
            few hundred short headlines there is not enough signal to re-tune a
            pooler, and mean pooling gives a more stable sentence vector at this
            data size.
            """

            def __init__(
                self, encoder: Any, hidden_size: int, num_emotions: int
            ) -> None:
                super().__init__()
                self.encoder = encoder
                self.dropout = nn.Dropout(0.1)
                self.regression_head = nn.Linear(hidden_size, 1)
                self.emotion_head = nn.Linear(hidden_size, num_emotions)

            def forward(self, input_ids, attention_mask):
                """Return (sentiment score in -1..1, emotion logits)."""
                outputs = self.encoder(
                    input_ids=input_ids, attention_mask=attention_mask
                )
                hidden = outputs.last_hidden_state

                mask = attention_mask.unsqueeze(-1).to(hidden.dtype)
                pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
                pooled = self.dropout(pooled)

                # tanh keeps the output inside the -1..+1 range the rest of the
                # platform already assumes for a sentiment score.
                score = torch.tanh(self.regression_head(pooled)).squeeze(-1)
                return score, self.emotion_head(pooled)

        _student_class = _DualHeadStudent
        return _student_class


class LocalSentimentModel:
    """
    Lazily-loaded local scorer shared across requests.

    ``load()`` is idempotent and guarded by a lock, so concurrent first requests
    do not each build their own copy of the model.
    """

    def __init__(
        self,
        artifacts_dir: str,
        variant: str = "student",
        base_model: str = DEFAULT_BASE_MODEL,
        max_length: int = 256,
        device: str | None = None,
    ) -> None:
        self.artifacts_dir = artifacts_dir
        self.variant = variant
        self.configured_base_model = base_model
        self.max_length = max_length
        self.requested_device = device

        self._model: Any = None
        self._tokenizer: Any = None
        self._device: Any = None
        self._lock = threading.Lock()
        self._load_error: str | None = None
        self._metadata: dict[str, Any] = {}

    # -- state ------------------------------------------------------------

    @property
    def is_loaded(self) -> bool:
        """True once the model is resident in memory."""
        return self._model is not None

    @property
    def load_error(self) -> str | None:
        """The reason the last load attempt failed, if it did."""
        return self._load_error

    def describe(self) -> dict[str, Any]:
        """Report what this backend is and whether it is usable, for /health."""
        return {
            "variant": self.variant,
            "artifacts_dir": self.artifacts_dir,
            "loaded": self.is_loaded,
            "load_error": self._load_error,
            **self._metadata,
        }

    # -- loading ----------------------------------------------------------

    def _resolve_base_model(self) -> str:
        """
        Read the base checkpoint the adapter was trained against.

        Taken from ``training_run.json`` when present so the adapter can never
        be attached to a different base than it was trained with.
        """
        run_path = os.path.join(self.artifacts_dir, "training_run.json")
        if os.path.exists(run_path):
            try:
                with open(run_path, encoding="utf-8") as fh:
                    return json.load(fh)["config"]["base_model"]
            except (KeyError, ValueError, OSError) as exc:
                logger.warning(
                    "Could not read base model from %s (%s); using configured %s",
                    run_path,
                    exc,
                    self.configured_base_model,
                )
        return self.configured_base_model

    def load(self) -> bool:
        """
        Load the model into memory. Safe to call repeatedly.

        Returns True if the model is usable afterwards.
        """
        if self._model is not None:
            return True

        with self._lock:
            if self._model is not None:
                return True
            try:
                self._load_unlocked()
                self._load_error = None
                return True
            except Exception as exc:  # noqa: BLE001 - surfaced via load_error
                self._load_error = f"{type(exc).__name__}: {exc}"
                logger.error("Local sentiment model failed to load: %s", self._load_error)
                return False

    def _load_unlocked(self) -> None:
        """Do the actual loading; assumes the lock is held."""
        torch = _torch()

        self._device = torch.device(
            self.requested_device or ("cuda" if torch.cuda.is_available() else "cpu")
        )
        base_model = self._resolve_base_model()

        if self.variant == "base":
            self._load_base_variant(base_model)
        else:
            self._load_student_variant(base_model, torch)

        self._metadata["base_model"] = base_model
        self._metadata["device"] = str(self._device)
        logger.info(
            "Local sentiment model ready: variant=%s base=%s device=%s",
            self.variant,
            base_model,
            self._device,
        )

    def _load_base_variant(self, base_model: str) -> None:
        """Load the public checkpoint through its own 3-class head."""
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        self._tokenizer = AutoTokenizer.from_pretrained(base_model)
        model = AutoModelForSequenceClassification.from_pretrained(base_model)
        model.to(self._device)
        model.eval()
        self._model = model

        self._metadata["id2label"] = {
            str(k): str(v) for k, v in model.config.id2label.items()
        }
        self._metadata["has_emotion_head"] = False

    def _load_student_variant(self, base_model: str, torch: Any) -> None:
        """Load the base encoder, attach the LoRA adapter, restore the heads."""
        from peft import PeftModel
        from transformers import AutoModel, AutoTokenizer

        adapter_dir = os.path.join(self.artifacts_dir, "lora_adapter")
        heads_path = os.path.join(self.artifacts_dir, "heads.pt")

        for path in (adapter_dir, heads_path):
            if not os.path.exists(path):
                raise FileNotFoundError(
                    f"{path} not found — run `python -m training.train_distill` "
                    "or set LOCAL_MODEL_VARIANT=base"
                )

        self._tokenizer = AutoTokenizer.from_pretrained(adapter_dir)
        base_encoder = AutoModel.from_pretrained(base_model)
        encoder = PeftModel.from_pretrained(base_encoder, adapter_dir)

        heads = torch.load(heads_path, map_location="cpu", weights_only=False)
        emotions = heads.get("emotions", EMOTIONS)

        model = build_student_class()(
            encoder, base_encoder.config.hidden_size, len(emotions)
        )
        model.regression_head.load_state_dict(heads["regression_head"])
        model.emotion_head.load_state_dict(heads["emotion_head"])
        model.to(self._device)
        model.eval()

        self._model = model
        self._emotions = emotions
        self._metadata["emotions"] = emotions
        self._metadata["has_emotion_head"] = True

    # -- inference --------------------------------------------------------

    def predict(self, text: str) -> tuple[float, str]:
        """
        Score one article. Returns (sentiment score in −1..+1, emotion label).

        Blocking CPU work — call it from a worker thread, not the event loop.
        """
        if not self.load():
            raise RuntimeError(f"Local model unavailable: {self._load_error}")

        torch = _torch()
        encoded = self._tokenizer(
            text,
            truncation=True,
            max_length=self.max_length,
            padding=True,
            return_tensors="pt",
        ).to(self._device)

        with torch.no_grad():
            if self.variant == "base":
                logits = self._model(**encoded).logits[0]
                probabilities = torch.softmax(logits, dim=-1)
                # Expected value over the label scores, so a confident positive
                # scores higher than a marginal one instead of snapping to 0.7.
                score = 0.0
                for index, probability in enumerate(probabilities.tolist()):
                    label = str(self._model.config.id2label[index]).lower()
                    score += probability * BASE_LABEL_SCORES.get(label, 0.0)
                return float(score), emotion_from_score(float(score))

            score, emotion_logits = self._model(
                encoded["input_ids"], encoded["attention_mask"]
            )
            emotion_index = int(emotion_logits.argmax(dim=-1)[0])
            return float(score[0]), self._emotions[emotion_index]


_instance: LocalSentimentModel | None = None
_instance_lock = threading.Lock()


def get_local_model() -> LocalSentimentModel:
    """Return the process-wide local model, constructing it on first call."""
    global _instance
    if _instance is not None:
        return _instance

    with _instance_lock:
        if _instance is None:
            from app.config import settings

            artifacts_dir = settings.local_model_dir
            if not os.path.isabs(artifacts_dir):
                service_dir = os.path.dirname(
                    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                )
                artifacts_dir = os.path.join(service_dir, artifacts_dir)

            _instance = LocalSentimentModel(
                artifacts_dir=artifacts_dir,
                variant=settings.local_model_variant,
                base_model=settings.local_model_base,
                max_length=settings.local_max_length,
                device=settings.local_model_device or None,
            )
    return _instance


def reset_local_model() -> None:
    """Drop the cached instance. Used by tests to pick up changed settings."""
    global _instance
    with _instance_lock:
        _instance = None
