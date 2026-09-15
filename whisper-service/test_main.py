from types import SimpleNamespace
from pathlib import Path

from fastapi.testclient import TestClient

import main


class FakeTranscriber:
    def __init__(self, text=" Hello world! ", language="en", error=None):
        self.text, self.language, self.error = text, language, error
        self.received_language = "__not_called__"

    def transcribe(self, path, language=None):
        assert Path(path).exists()
        self.received_language = language
        if self.error:
            raise self.error
        return iter([SimpleNamespace(text=self.text)]), SimpleNamespace(language=self.language)


def test_health():
    assert TestClient(main.app).get("/health").json() == {"status": "ok"}


def test_preload_disabled_keeps_model_lazy(monkeypatch):
    called = []
    monkeypatch.setattr(main, "PRELOAD_MODEL", False)
    monkeypatch.setattr(main, "get_model", lambda: called.append(True))
    main.preload_model()
    assert called == []


def test_preload_enabled_loads_model_once(monkeypatch, caplog):
    caplog.set_level("INFO", logger="whisper-service")
    called = []
    monkeypatch.setattr(main, "PRELOAD_MODEL", True)
    monkeypatch.setattr(main, "get_model", lambda: called.append(True))
    main.preload_model()
    assert called == [True]
    assert "AI_WARMUP service=whisper status=success" in caplog.text


def test_preload_failure_is_logged_and_does_not_escape(monkeypatch, caplog):
    monkeypatch.setattr(main, "PRELOAD_MODEL", True)
    monkeypatch.setattr(main, "get_model", lambda: (_ for _ in ()).throw(RuntimeError("private path")))
    main.preload_model()
    assert "AI_WARMUP service=whisper status=error" in caplog.text
    assert "private path" not in caplog.text


def test_valid_file_returns_text_and_language(monkeypatch):
    monkeypatch.setattr(main, "get_model", lambda: FakeTranscriber())
    response = TestClient(main.app).post("/transcribe", files={"file": ("voice.wav", b"audio", "audio/wav")})
    assert response.status_code == 200
    assert response.json() == {"text": "Hello world!", "language": "en"}


def test_explicit_portuguese_language_is_passed_to_transcriber(monkeypatch):
    fake = FakeTranscriber(text="Olá, eu me chamo Vitor.", language="pt")
    monkeypatch.setattr(main, "get_model", lambda: fake)
    response = TestClient(main.app).post("/transcribe", data={"language": "pt"}, files={"file": ("voice.wav", b"audio", "audio/wav")})
    assert response.status_code == 200
    assert fake.received_language == "pt"
    assert response.json()["language"] == "pt"


def test_explicit_english_language_is_passed_to_transcriber(monkeypatch):
    fake = FakeTranscriber(language="en")
    monkeypatch.setattr(main, "get_model", lambda: fake)
    response = TestClient(main.app).post("/transcribe", data={"language": "en"}, files={"file": ("voice.wav", b"audio", "audio/wav")})
    assert response.status_code == 200
    assert fake.received_language == "en"


def test_missing_language_keeps_automatic_detection(monkeypatch):
    fake = FakeTranscriber(language="pt")
    monkeypatch.setattr(main, "get_model", lambda: fake)
    response = TestClient(main.app).post("/transcribe", files={"file": ("voice.wav", b"audio", "audio/wav")})
    assert response.status_code == 200
    assert fake.received_language is None
    assert response.json()["language"] == "pt"


def test_invalid_language_is_rejected():
    response = TestClient(main.app).post("/transcribe", data={"language": "it"}, files={"file": ("voice.wav", b"audio", "audio/wav")})
    assert response.status_code == 400


def test_empty_language_is_rejected():
    response = TestClient(main.app).post("/transcribe", data={"language": ""}, files={"file": ("voice.wav", b"audio", "audio/wav")})
    assert response.status_code == 400


def test_empty_file_is_rejected():
    response = TestClient(main.app).post("/transcribe", files={"file": ("voice.wav", b"", "audio/wav")})
    assert response.status_code == 400


def test_invalid_format_is_rejected():
    response = TestClient(main.app).post("/transcribe", files={"file": ("voice.txt", b"audio", "text/plain")})
    assert response.status_code == 415


def test_oversized_file_is_rejected(monkeypatch):
    monkeypatch.setattr(main, "MAX_FILE_SIZE", 2)
    response = TestClient(main.app).post("/transcribe", files={"file": ("voice.wav", b"123", "audio/wav")})
    assert response.status_code == 413


def test_internal_failure_is_generic(monkeypatch):
    monkeypatch.setattr(main, "get_model", lambda: FakeTranscriber(error=RuntimeError("secret path")))
    response = TestClient(main.app).post("/transcribe", files={"file": ("voice.wav", b"audio", "audio/wav")})
    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to transcribe audio"}


def test_temporary_file_removed_after_success(monkeypatch):
    paths = []
    original = main.transcribe_path
    def wrapped(path, language=None, transcriber=None):
        paths.append(path)
        return original(path, language=language, transcriber=transcriber or FakeTranscriber())
    monkeypatch.setattr(main, "transcribe_path", wrapped)
    assert TestClient(main.app).post("/transcribe", files={"file": ("voice.wav", b"audio", "audio/wav")}).status_code == 200
    assert paths and not Path(paths[0]).exists()


def test_temporary_file_removed_after_error(monkeypatch):
    paths = []
    def failing(path, language=None, transcriber=None):
        paths.append(path)
        raise RuntimeError("failure")
    monkeypatch.setattr(main, "transcribe_path", failing)
    assert TestClient(main.app).post("/transcribe", files={"file": ("voice.wav", b"audio", "audio/wav")}).status_code == 500
    assert paths and not Path(paths[0]).exists()


# Import an isolated copy to exercise dotenv without using real models or local secrets.
def test_dotenv_is_relative_to_main_and_external_environment_wins(monkeypatch, tmp_path):
    import os
    import runpy
    import shutil

    service_dir = tmp_path / "service"
    service_dir.mkdir()
    copied_main = service_dir / "main.py"
    shutil.copyfile(Path(main.__file__), copied_main)
    (service_dir / ".env").write_text("WHISPER_MAX_FILE_SIZE_MB=7\nWHISPER_LOG_LEVEL=INFO\n", encoding="utf-8")
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (elsewhere / ".env").write_text("WHISPER_MAX_FILE_SIZE_MB=999\n", encoding="utf-8")
    monkeypatch.chdir(elsewhere)
    for key in list(os.environ):
        if key.startswith("WHISPER_"):
            monkeypatch.delenv(key)
    monkeypatch.delenv("PYTHON_DOTENV_DISABLED", raising=False)
    # Register absent keys so monkeypatch also cleans variables added by dotenv.
    for key in ("WHISPER_MAX_FILE_SIZE_MB", "WHISPER_LOG_LEVEL"):
        monkeypatch.setenv(key, "temporary")
        monkeypatch.delenv(key)
    loaded = runpy.run_path(str(copied_main))
    assert loaded["MAX_FILE_SIZE"] == 7 * 1024 * 1024
    assert TestClient(loaded["app"]).get("/health").status_code == 200
    monkeypatch.setenv("WHISPER_MAX_FILE_SIZE_MB", "9")
    loaded = runpy.run_path(str(copied_main))
    assert loaded["MAX_FILE_SIZE"] == 9 * 1024 * 1024
