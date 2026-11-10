"""Builds and runs the speech + POS pipeline described by the config blueprint."""

from __future__ import annotations

import logging
import os
import threading
import time

import numpy as np
import torch
from transformers import pipeline as hf_pipeline

from .alignment import PosSpan, align_words, build_transcript, split_for_tagger
from .audio import SAMPLE_RATE
from .config import PipelineConfig

log = logging.getLogger(__name__)

WHISPER_CHUNK_SECONDS = 30

MIN_VRAM_GB_FOR_TAGGER = 6


class EngineNotReady(RuntimeError):
    pass


class SpeechPosEngine:
    def __init__(self, config: PipelineConfig):
        self.config = config
        self.state = "pending"  # pending -> loading -> ready | error
        self.stage = ""
        self.error: str | None = None
        self.device = self._pick_device()
        self.device_name = (
            torch.cuda.get_device_name(0) if self.device == "cuda" else "CPU"
        )
        self.pos_device = self._pick_pos_device()
        self._asr = None
        self._pos = None
        # One model run at a time: the GPU can't hold two, and CPU runs would just thrash.
        self._lock = threading.Lock()

    @staticmethod
    def _pick_device() -> str:
        requested = os.environ.get("SPEECH_POS_DEVICE", "auto").lower()
        if requested != "auto":
            return requested
        return "cuda" if torch.cuda.is_available() else "cpu"

    def _pick_pos_device(self) -> str:
        if self.device != "cuda":
            return self.device
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        return "cuda" if vram_gb >= MIN_VRAM_GB_FOR_TAGGER else "cpu"

    def load(self) -> None:
        """Loads both models. Runs in a background thread so the API can report progress."""
        self.state = "loading"
        try:
            self.stage = f"Loading {self.config.asr_model}"
            self._asr = hf_pipeline(
                task=self.config.asr_task,
                model=self.config.asr_model,
                device=self.device,
                # Not float16: on GTX 16-series cards it silently produces an empty
                # transcript, with no error (confirmed on a GTX 1650).
                dtype=torch.float32,
            )
            self.stage = f"Loading {self.config.pos_model}"
            self._pos = hf_pipeline(
                task=self.config.pos_task,
                model=self.config.pos_model,
                device=self.pos_device,
                aggregation_strategy=self.config.pos_aggregation_strategy,
            )
            self.state, self.stage = "ready", ""
            log.info("Pipeline ready on %s", self.device_name)
        except Exception as exc:
            log.exception("Model loading failed")
            self.state, self.stage, self.error = "error", "", str(exc)

    def status(self) -> dict:
        return {
            "state": self.state,
            "stage": self.stage,
            "error": self.error,
            "device": {"type": "gpu" if self.device == "cuda" else "cpu", "name": self.device_name},
            "pos_device": "GPU" if self.pos_device == "cuda" else "CPU",
            "config": self.config.to_dict(),
        }

    def analyze(self, audio: np.ndarray) -> dict:
        if self.state != "ready":
            raise EngineNotReady("The models are not loaded yet.")

        duration = audio.size / SAMPLE_RATE
        with self._lock:
            started = time.perf_counter()
            # English only: the POS model is English, so other languages would get
            # meaningless tags. Forcing it also stops Whisper guessing on short clips.
            asr_output = self._asr(
                {"raw": audio, "sampling_rate": SAMPLE_RATE},
                return_timestamps="word",
                chunk_length_s=WHISPER_CHUNK_SECONDS,
                generate_kwargs={"language": "english", "task": "transcribe"},
            )
            asr_seconds = time.perf_counter() - started

            text, timed = build_transcript(asr_output.get("chunks", []), duration)

            started = time.perf_counter()
            pos_spans = self._tag(text)
            pos_seconds = time.perf_counter() - started

        return {
            "text": text,
            "duration": round(duration, 3),
            "words": align_words(text, timed, pos_spans),
            "timing": {
                "asr_seconds": round(asr_seconds, 2),
                "pos_seconds": round(pos_seconds, 2),
                "asr_device": self.device_name,
                "pos_device": "GPU" if self.pos_device == "cuda" else "CPU",
            },
        }

    def _tag(self, text: str) -> list[PosSpan]:
        windows = split_for_tagger(text)
        if not windows:
            return []
        results = self._pos([window for _, window in windows])
        return [
            PosSpan(
                start_char=offset + int(entity["start"]),
                end_char=offset + int(entity["end"]),
                tag=str(entity["entity_group"]),
                score=float(entity["score"]),
            )
            for (offset, _), entities in zip(windows, results)
            for entity in entities
        ]
