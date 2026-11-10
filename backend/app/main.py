"""HTTP API. Run with: uvicorn app.main:app --port 8000"""

from __future__ import annotations

import logging
import os
import threading
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .audio import AudioDecodeError, AudioTooLongError, decode_audio
from .config import load_config
from .pipeline import EngineNotReady, SpeechPosEngine

logging.basicConfig(level=logging.WARNING)
logging.getLogger("app").setLevel(logging.INFO)

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "100")) * 1024 * 1024
MAX_AUDIO_SECONDS = float(os.environ.get("MAX_AUDIO_MINUTES", "30")) * 60
ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

engine = SpeechPosEngine(load_config())


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load in the background: the first run downloads about 1.4 GB of models, and the
    # API must be able to report that progress meanwhile.
    threading.Thread(target=engine.load, daemon=True).start()
    yield


app = FastAPI(title=engine.config.project_title, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/status")
def status() -> dict:
    return {
        **engine.status(),
        "limits": {
            "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024),
            "max_audio_minutes": MAX_AUDIO_SECONDS / 60,
        },
    }


# A plain def, so FastAPI runs this slow work in a worker thread and /api/status stays live.
@app.post("/api/analyze")
def analyze(file: UploadFile = File(...)) -> dict:
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File is larger than the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.")
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")

    try:
        audio = decode_audio(data, MAX_AUDIO_SECONDS)
    except AudioTooLongError as exc:
        raise HTTPException(413, str(exc)) from exc
    except AudioDecodeError as exc:
        raise HTTPException(422, str(exc)) from exc

    try:
        return engine.analyze(audio)
    except EngineNotReady as exc:
        raise HTTPException(503, str(exc)) from exc
    except torch.cuda.OutOfMemoryError as exc:
        torch.cuda.empty_cache()
        raise HTTPException(
            503,
            "The GPU ran out of memory. Close other GPU apps, or restart the backend with SPEECH_POS_DEVICE=cpu.",
        ) from exc
