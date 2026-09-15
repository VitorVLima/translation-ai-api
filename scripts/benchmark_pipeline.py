"""Measure the authenticated EnglishAI STT -> chat SSE -> TTS pipeline.

No retry is performed. Tokens and payload text stay in memory and are never printed.
Audio paths are supplied through ENGLISHAI_BENCHMARK_AUDIO_EN/PT and are not modified.
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path


BASE_URL = os.getenv("ENGLISHAI_BENCHMARK_BASE_URL", "http://localhost:8080").rstrip("/")
TIMEOUT = float(os.getenv("ENGLISHAI_BENCHMARK_TIMEOUT_SECONDS", "180"))


@dataclass
class Cycle:
    index: int
    stt_ms: float
    first_token_ms: float
    chat_total_ms: float
    tts_ms: float
    pipeline_ms: float


class BenchmarkFailure(RuntimeError):
    def __init__(self, stage: str, status: str, error_type: str):
        super().__init__(f"stage={stage} status={status} error_type={error_type}")
        self.stage, self.status, self.error_type = stage, status, error_type


def elapsed(start: float) -> float:
    return (time.perf_counter() - start) * 1000


def request(path: str, method: str = "GET", body: bytes | None = None,
            headers: dict[str, str] | None = None):
    req = urllib.request.Request(BASE_URL + path, data=body, method=method, headers=headers or {})
    try:
        return urllib.request.urlopen(req, timeout=TIMEOUT)
    except urllib.error.HTTPError as exc:
        raise BenchmarkFailure("http", str(exc.code), status_category(exc.code)) from None
    except (urllib.error.URLError, TimeoutError):
        raise BenchmarkFailure("http", "unavailable", "connection_refused") from None


def status_category(status: int) -> str:
    return {400: "400", 401: "401", 413: "413", 415: "415", 429: "429", 500: "500", 503: "503"}.get(status, str(status))


def access_token() -> str:
    token = os.getenv("ENGLISHAI_BENCHMARK_TOKEN", "").strip()
    if token:
        return token
    email, password = os.getenv("ENGLISHAI_BENCHMARK_EMAIL", ""), os.getenv("ENGLISHAI_BENCHMARK_PASSWORD", "")
    if not email or not password:
        raise BenchmarkFailure("auth", "missing", "credentials_required")
    payload = json.dumps({"email": email, "password": password}).encode()
    try:
        with request("/api/v1/auth/login", "POST", payload, {"Content-Type": "application/json"}) as response:
            data = json.loads(response.read())
    except json.JSONDecodeError:
        raise BenchmarkFailure("auth", "200", "invalid_json") from None
    token = data.get("accessToken")
    if not isinstance(token, str) or not token:
        raise BenchmarkFailure("auth", "200", "missing_access_token")
    return token


def multipart(audio: bytes, language: str) -> tuple[bytes, str]:
    boundary = "----EnglishAI-Benchmark-" + uuid.uuid4().hex
    chunks = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"benchmark.wav\"\r\nContent-Type: audio/wav\r\n\r\n".encode(),
        audio,
        f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\n{language}\r\n--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def transcribe(audio: bytes, language: str, token: str) -> tuple[str, float]:
    body, content_type = multipart(audio, language)
    started = time.perf_counter()
    try:
        with request("/api/v1/transcriptions", "POST", body, {"Content-Type": content_type, "Authorization": f"Bearer {token}"}) as response:
            data = json.loads(response.read())
    except json.JSONDecodeError:
        raise BenchmarkFailure("stt", "200", "invalid_json") from None
    except BenchmarkFailure as exc:
        exc.stage = "stt"
        raise
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        raise BenchmarkFailure("stt", "200", "empty_response")
    return text, elapsed(started)


def chat_stream(text: str, language: str, token: str) -> tuple[str, float, float]:
    body = json.dumps({"message": text, "language": language, "history": []}).encode()
    started = time.perf_counter()
    try:
        response = request("/api/v1/chat/stream", "POST", body, {"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    except BenchmarkFailure as exc:
        exc.stage = "chat"
        raise
    first_token = None
    reply_parts: list[str] = []
    event_name, data_parts = "", []

    def dispatch() -> bool:
        nonlocal first_token
        if not event_name:
            return False
        raw = "\n".join(data_parts)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            raise BenchmarkFailure("chat", "200", "invalid_json") from None
        if event_name == "token":
            chunk = payload.get("text")
            if not isinstance(chunk, str):
                raise BenchmarkFailure("chat", "200", "invalid_sse")
            if chunk and first_token is None:
                first_token = elapsed(started)
            reply_parts.append(chunk)
        elif event_name == "error":
            raise BenchmarkFailure("chat", "200", "sse_error")
        return event_name == "complete"

    buffer = ""
    try:
        for raw_line in response:
            buffer += raw_line.decode("utf-8")
            lines = buffer.splitlines(keepends=True)
            buffer = lines.pop() if lines and not lines[-1].endswith(("\n", "\r")) else ""
            for line in lines:
                line = line.rstrip("\r\n")
                if line.startswith("event:"):
                    event_name = line[6:].strip()
                elif line.startswith("data:"):
                    data_parts.append(line[5:].lstrip())
                elif not line:
                    complete = dispatch()
                    event_name, data_parts = "", []
                    if complete:
                        return "".join(reply_parts), first_token or elapsed(started), elapsed(started)
        if buffer:
            if buffer.startswith("data:"):
                data_parts.append(buffer[5:].lstrip())
            dispatch()
    except UnicodeDecodeError:
        raise BenchmarkFailure("chat", "200", "invalid_sse") from None
    finally:
        response.close()
    raise BenchmarkFailure("chat", "200", "sse_interrupted")


def synthesize(reply: str, language: str, token: str) -> float:
    body = json.dumps({"text": reply, "language": language}).encode()
    started = time.perf_counter()
    try:
        with request("/api/v1/speech", "POST", body, {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}) as response:
            content_type = response.headers.get("Content-Type", "")
            audio = response.read()
    except BenchmarkFailure as exc:
        exc.stage = "tts"
        raise
    if not content_type.lower().startswith("audio/wav"):
        raise BenchmarkFailure("tts", "200", "invalid_content_type")
    if not audio:
        raise BenchmarkFailure("tts", "200", "empty_response")
    return elapsed(started)


def load_audio(language: str) -> bytes:
    variable = f"ENGLISHAI_BENCHMARK_AUDIO_{language.upper()}"
    value = os.getenv(variable, "").strip()
    if not value:
        raise BenchmarkFailure("setup", "missing", f"{variable}_required")
    path = Path(value)
    try:
        audio = path.read_bytes()
    except OSError:
        raise BenchmarkFailure("setup", "missing", "audio_file_unreadable") from None
    if not audio:
        raise BenchmarkFailure("setup", "empty", "audio_file_empty")
    return audio


def stats(rows: list[Cycle], attr: str) -> tuple[float, float, float, float]:
    values = [getattr(row, attr) for row in rows]
    return min(values), max(values), statistics.mean(values), statistics.median(values)


def run(language: str, count: int, token: str) -> tuple[list[Cycle], list[dict[str, str]]]:
    audio = load_audio(language)
    rows, failures = [], []
    for index in range(1, count + 1):
        pipeline_start = time.perf_counter()
        try:
            text, stt_ms = transcribe(audio, language, token)
            reply, first_ms, chat_ms = chat_stream(text, language, token)
            if not reply.strip():
                raise BenchmarkFailure("chat", "200", "empty_reply")
            tts_ms = synthesize(reply, language, token)
            rows.append(Cycle(index, stt_ms, first_ms, chat_ms, tts_ms, elapsed(pipeline_start)))
            print(f"{language.upper()} cycle={index} stt_ms={stt_ms:.0f} first_token_ms={first_ms:.0f} chat_total_ms={chat_ms:.0f} tts_ms={tts_ms:.0f} pipeline_ms={rows[-1].pipeline_ms:.0f}")
        except BenchmarkFailure as exc:
            failures.append({"cycle": str(index), "stage": exc.stage, "status": exc.status, "error_type": exc.error_type})
            print(f"{language.upper()} cycle={index} stage={exc.stage} status=failed error_type={exc.error_type}")
    return rows, failures


def print_summary(language: str, rows: list[Cycle]) -> None:
    print(f"\n{language.upper()} SUMMARY")
    print("metric min_ms max_ms mean_ms median_ms")
    for label, attr in (("stt", "stt_ms"), ("first_token", "first_token_ms"), ("chat_total", "chat_total_ms"), ("tts", "tts_ms"), ("pipeline", "pipeline_ms")):
        values = stats(rows, attr)
        print(f"{label} " + " ".join(f"{value:.1f}" for value in values))
    if language == "en" and len(rows) >= 2:
        print("EN WARM SUMMARY (cycles 2..N)")
        warm = rows[1:]
        for label, attr in (("stt", "stt_ms"), ("first_token", "first_token_ms"), ("chat_total", "chat_total_ms"), ("tts", "tts_ms"), ("pipeline", "pipeline_ms")):
            values = stats(warm, attr)
            print(f"{label} " + " ".join(f"{value:.1f}" for value in values))


def main() -> int:
    parser = argparse.ArgumentParser(description="Authenticated EnglishAI pipeline benchmark")
    parser.add_argument("--en-cycles", type=int, default=5)
    parser.add_argument("--pt-cycles", type=int, default=3)
    args = parser.parse_args()
    if args.en_cycles < 1 or args.pt_cycles < 1:
        parser.error("cycle counts must be positive")
    try:
        token = access_token()
        all_failures = []
        for language, count in (("en", args.en_cycles), ("pt", args.pt_cycles)):
            rows, failures = run(language, count, token)
            all_failures.extend(failures)
            if rows:
                print_summary(language, rows)
            else:
                print(f"{language.upper()} SUMMARY no successful cycles")
        print(f"FAILURES {len(all_failures)}")
        return 1 if all_failures else 0
    except BenchmarkFailure as exc:
        print(f"BENCHMARK BLOCKED/FAILED stage={exc.stage} status={exc.status} error_type={exc.error_type}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
