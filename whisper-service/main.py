"""Small local speech-to-text service backed by faster-whisper."""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Protocol

from fastapi import FastAPI, Form, HTTPException, Request, UploadFile
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

logger = logging.getLogger("whisper-service")
logging.basicConfig(level=os.getenv("WHISPER_LOG_LEVEL", "INFO"))

ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg"}
MAX_FILE_SIZE = int(os.getenv("WHISPER_MAX_FILE_SIZE_MB", "20")) * 1024 * 1024
_MISSING_LANGUAGE = "__automatic_detection__"


class Transcriber(Protocol):
    def transcribe(self, path: str, language: str | None = None): ...


_model: Transcriber | None = None
_model_lock = Lock()


def get_model() -> Transcriber:
    """Load the model once, on the first transcription request."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel

                _model = WhisperModel(
                    os.getenv("WHISPER_MODEL", "small"),
                    device=os.getenv("WHISPER_DEVICE", "cpu"),
                    compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
                )
                logger.info("WHISPER_MODEL_READY")
    return _model


def transcribe_path(path: str, language: str | None = None, transcriber: Transcriber | None = None) -> dict[str, str]:
    engine = transcriber or get_model()
    if language is None:
        segments, info = engine.transcribe(path)
    else:
        segments, info = engine.transcribe(path, language=language)
    text = "".join(segment.text for segment in segments).strip()
    language = getattr(info, "language", None) or "unknown"
    return {"text": text, "language": language}


async def save_upload(file: UploadFile) -> str:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported audio format")
    if file.content_type and not (file.content_type.startswith("audio/") or file.content_type == "application/octet-stream"):
        raise HTTPException(status_code=415, detail="Unsupported audio format")
    temporary = tempfile.NamedTemporaryFile(prefix="englishai-whisper-", suffix=suffix, delete=False)
    total = 0
    try:
        with temporary:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_FILE_SIZE:
                    raise HTTPException(status_code=413, detail="Audio file is too large")
                temporary.write(chunk)
        if total == 0:
            raise HTTPException(status_code=400, detail="Audio file is empty")
        return temporary.name
    except Exception:
        try:
            os.unlink(temporary.name)
        except FileNotFoundError:
            pass
        raise
    finally:
        await file.close()


app = FastAPI(title="EnglishAI Whisper Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(file: UploadFile, language: str = Form(default=_MISSING_LANGUAGE), request: Request = None) -> dict[str, str]:
    if language == _MISSING_LANGUAGE:
        if request is not None:
            form = await request.form()
            if "language" in form:
                raise HTTPException(status_code=400, detail="Invalid language")
        language = None
    elif language not in {"pt", "en"}:
        raise HTTPException(status_code=400, detail="Invalid language")
    path = await save_upload(file)
    try:
        return transcribe_path(path, language=language)
    except HTTPException:
        raise
    except Exception:
        logger.error("TRANSCRIPTION_FAILED")
        raise HTTPException(status_code=500, detail="Unable to transcribe audio")
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
