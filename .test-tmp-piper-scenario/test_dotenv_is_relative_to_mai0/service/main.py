"""Local text-to-speech service backed by Piper."""

from __future__ import annotations

import logging
import math
import re
import os
import subprocess
import tempfile
import shutil
import time
from pathlib import Path
from typing import Protocol

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

logger = logging.getLogger("piper-service")
logging.basicConfig(level=os.getenv("PIPER_LOG_LEVEL", "INFO"))

MAX_TEXT_LENGTH = int(os.getenv("PIPER_MAX_TEXT_LENGTH", "3000"))
SYNTHESIS_TIMEOUT = float(os.getenv("PIPER_SYNTHESIS_TIMEOUT_SECONDS", "30"))
WARMUP_ENABLED = os.getenv("PIPER_WARMUP_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


class PiperSynthesisError(RuntimeError):
    """Raised when Piper cannot produce a valid WAV."""


class Synthesizer(Protocol):
    def synthesize(self, text: str, language: str, voice: str | None = None, speech_rate: float = 1.0) -> bytes: ...
    def voices(self) -> list[dict[str, str]]: ...


class PiperSynthesizer:
    def __init__(
        self,
        executable: str | None = None,
        pt_model: str | None = None,
        en_model: str | None = None,
        timeout: float = SYNTHESIS_TIMEOUT,
    ) -> None:
        self.executable = executable or os.getenv("PIPER_EXECUTABLE", "piper")
        self.models = {"pt": pt_model or os.getenv("PIPER_PT_MODEL_PATH", ""),
                       "en": en_model or os.getenv("PIPER_EN_MODEL_PATH", "")}
        self.timeout = timeout

    def _voice_models(self) -> dict[str, tuple[str, Path]]:
        """Only installed models beside the configured defaults; never accept a client path."""
        models = {}
        for language, configured in self.models.items():
            if not configured:
                continue
            default = Path(configured)
            candidates = {default, *default.parent.glob(f"{language}_*.onnx")}
            for model in sorted(candidates):
                if (model.is_file() and Path(str(model) + ".json").is_file()
                        and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", model.stem)):
                    models[model.stem] = (language, model)
        return models

    def voices(self) -> list[dict[str, str]]:
        return [{"key": key, "displayName": " ".join(key.split("-")[1:] or [key]).replace("_", " ").title(),
                 "language": language} for key, (language, _) in self._voice_models().items()]

    def synthesize(self, text: str, language: str, voice: str | None = None, speech_rate: float = 1.0) -> bytes:
        model = self.models.get(language, "")
        if voice is not None:
            selected = self._voice_models().get(voice)
            if selected is None:
                raise PiperSynthesisError("Voice unavailable")
            # A scenario is shared by EN/PT conversations: keep the requested language intelligible.
            if selected[0] == language:
                model = str(selected[1])
        if not math.isfinite(speech_rate) or not 0.75 <= speech_rate <= 1.25:
            raise PiperSynthesisError("Invalid speech rate")
        executable = self.executable
        if not model or not self._executable_exists(executable) or not Path(model).is_file():
            logger.error("PIPER_CONFIGURATION_INVALID language=%s", language)
            raise PiperSynthesisError("Piper voice model is not configured")
        length_scale = None
        if language == "en":
            try:
                length_scale = float(os.getenv("PIPER_EN_LENGTH_SCALE", "1.0"))
                if not math.isfinite(length_scale) or not 0.5 <= length_scale <= 2.0:
                    raise ValueError()
            except ValueError:
                logger.error("PIPER_LENGTH_SCALE_INVALID")
                raise PiperSynthesisError("Piper configuration is invalid") from None
        # Speed is a multiplier; Piper accepts duration, so the relationship is inverse.
        if length_scale is not None or speech_rate != 1.0:
            length_scale = (length_scale if length_scale is not None else 1.0) / speech_rate
        output_path: str | None = None
        try:
            with tempfile.NamedTemporaryFile(prefix="englishai-piper-", suffix=".wav", delete=False) as output:
                output_path = output.name
            command = [executable, "--model", model]
            if length_scale is not None:
                command.extend(["--length-scale", str(length_scale)])
            command.extend(["--output_file", output_path])
            completed = subprocess.run(
                command,
                input=text,
                text=True,
                capture_output=True,
                timeout=self.timeout,
                check=False,
            )
            if completed.returncode != 0:
                raise PiperSynthesisError("Piper synthesis failed")
            audio = Path(output_path).read_bytes()
            if not audio:
                raise PiperSynthesisError("Piper returned an empty audio file")
            return audio
        except subprocess.TimeoutExpired as exc:
            raise PiperSynthesisError("Piper synthesis timed out") from exc
        except (OSError, ValueError) as exc:
            raise PiperSynthesisError("Piper synthesis failed") from exc
        finally:
            if output_path:
                try:
                    Path(output_path).unlink()
                except FileNotFoundError:
                    pass

    @staticmethod
    def _executable_exists(executable: str) -> bool:
        return Path(executable).is_file() if ("/" in executable or "\\" in executable) else shutil.which(executable) is not None


class SynthesizeRequest(BaseModel):
    text: str | None = None
    language: str | None = None
    voice: str | None = None
    speechRate: float = 1.0


app = FastAPI(title="EnglishAI Piper Service")
_synthesizer: Synthesizer | None = None


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": "Invalid synthesis request"})


def get_synthesizer() -> Synthesizer:
    global _synthesizer
    if _synthesizer is None:
        _synthesizer = PiperSynthesizer()
    return _synthesizer


def warmup() -> None:
    """Optionally initialize both Piper voices once during service startup."""
    if not WARMUP_ENABLED:
        return
    started = time.perf_counter()
    synthesizer = get_synthesizer()
    for language, phrase in (("en", "Ready."), ("pt", "Pronto.")):
        try:
            synthesizer.synthesize(phrase, language)
            logger.info("AI_WARMUP service=piper language=%s status=success duration_ms=%d", language, int((time.perf_counter() - started) * 1000))
        except Exception:
            logger.error("AI_WARMUP service=piper language=%s status=error duration_ms=%d", language, int((time.perf_counter() - started) * 1000))


@app.on_event("startup")
def startup_warmup() -> None:
    warmup()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/synthesize")
def synthesize(request: SynthesizeRequest) -> Response:
    if request.text is None or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required")
    if request.language not in {"pt", "en"}:
        raise HTTPException(status_code=400, detail="Language must be pt or en")
    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=413, detail="Text is too long")
    if (not math.isfinite(request.speechRate) or not 0.75 <= request.speechRate <= 1.25
            or (request.voice is not None and not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", request.voice))):
        raise HTTPException(status_code=400, detail="Invalid speech settings")
    try:
        audio = get_synthesizer().synthesize(request.text, request.language, request.voice, request.speechRate)
    except PiperSynthesisError:
        logger.error("SYNTHESIS_FAILED language=%s text_length=%d", request.language, len(request.text))
        raise HTTPException(status_code=500, detail="Unable to synthesize speech")
    logger.info("SYNTHESIS_SUCCEEDED language=%s text_length=%d", request.language, len(request.text))
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store", "Content-Disposition": "inline"})


@app.get("/voices")
def voices() -> list[dict[str, str]]:
    return get_synthesizer().voices()
