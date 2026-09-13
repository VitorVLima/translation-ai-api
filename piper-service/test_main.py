import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pytest
from fastapi.testclient import TestClient

import main


class FakeSynthesizer:
    def __init__(self, audio=b"RIFFfake-wav"):
        self.audio = audio
        self.calls = []
        self.error = None

    def synthesize(self, text, language):
        self.calls.append((text, language))
        if self.error:
            raise self.error
        return self.audio


@pytest.fixture
def fake(monkeypatch):
    synthesizer = FakeSynthesizer()
    monkeypatch.setattr(main, "_synthesizer", synthesizer)
    monkeypatch.setattr(main, "MAX_TEXT_LENGTH", 3000)
    return synthesizer


def test_health():
    response = TestClient(main.app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("language", ["en", "pt"])
def test_synthesis_returns_wav_and_preserves_language(fake, language):
    response = TestClient(main.app).post("/synthesize", json={"text": "Hello", "language": language})
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.headers["cache-control"] == "no-store"
    assert response.content == b"RIFFfake-wav"
    assert fake.calls == [("Hello", language)]


def test_blank_text_is_rejected(fake):
    assert TestClient(main.app).post("/synthesize", json={"text": "  ", "language": "en"}).status_code == 400


def test_missing_or_invalid_language_is_rejected(fake):
    client = TestClient(main.app)
    assert client.post("/synthesize", json={"text": "Hello"}).status_code == 400
    assert client.post("/synthesize", json={"text": "Hello", "language": "es"}).status_code == 400


def test_text_limit_is_rejected(fake):
    response = TestClient(main.app).post("/synthesize", json={"text": "x" * 3001, "language": "en"})
    assert response.status_code == 413


def test_synthesis_failure_is_generic(fake):
    fake.error = main.PiperSynthesisError("private detail")
    response = TestClient(main.app).post("/synthesize", json={"text": "Hello", "language": "en"})
    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to synthesize speech"}
    assert "private" not in response.text


def test_piper_command_uses_argument_list_and_cleans_temp(monkeypatch):
    captured = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        captured["kwargs"] = kwargs
        Path(command[-1]).write_bytes(b"RIFFwav")
        return type("Result", (), {"returncode": 0})()

    monkeypatch.setattr(main.subprocess, "run", fake_run)
    monkeypatch.setattr(main.shutil, "which", lambda _: "piper")
    model = Path("piper-test-model.onnx")
    model.write_bytes(b"model")
    try:
        synthesizer = main.PiperSynthesizer("piper", str(model), str(model), 5)
        audio = synthesizer.synthesize("hello; --model", "en")
    finally:
        model.unlink(missing_ok=True)
    assert audio == b"RIFFwav"
    assert captured["command"][:3] == ["piper", "--model", str(model)]
    assert captured["kwargs"]["input"] == "hello; --model"
    assert captured["kwargs"]["timeout"] == 5
    assert not Path(captured["command"][-1]).exists()


# Import an isolated copy to exercise dotenv without using real models or local secrets.
def test_dotenv_is_relative_to_main_and_external_environment_wins(monkeypatch, tmp_path):
    import os
    import runpy
    import shutil

    service_dir = tmp_path / "service"
    service_dir.mkdir()
    copied_main = service_dir / "main.py"
    shutil.copyfile(Path(main.__file__), copied_main)
    (service_dir / ".env").write_text("PIPER_MAX_TEXT_LENGTH=777\nPIPER_LOG_LEVEL=INFO\n", encoding="utf-8")
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    (elsewhere / ".env").write_text("PIPER_MAX_TEXT_LENGTH=999\n", encoding="utf-8")
    monkeypatch.chdir(elsewhere)
    for key in list(os.environ):
        if key.startswith("PIPER_"):
            monkeypatch.delenv(key)
    monkeypatch.delenv("PYTHON_DOTENV_DISABLED", raising=False)
    # Register absent keys so monkeypatch also cleans variables added by dotenv.
    for key in ("PIPER_MAX_TEXT_LENGTH", "PIPER_LOG_LEVEL"):
        monkeypatch.setenv(key, "temporary")
        monkeypatch.delenv(key)
    loaded = runpy.run_path(str(copied_main))
    assert loaded["MAX_TEXT_LENGTH"] == 777
    assert TestClient(loaded["app"]).get("/health").status_code == 200
    monkeypatch.setenv("PIPER_MAX_TEXT_LENGTH", "9")
    loaded = runpy.run_path(str(copied_main))
    assert loaded["MAX_TEXT_LENGTH"] == 9


@pytest.fixture
def configured_piper(monkeypatch, tmp_path):
    en = tmp_path / "en.onnx"
    pt = tmp_path / "pt.onnx"
    en.touch()
    pt.touch()
    monkeypatch.setattr(main.shutil, "which", lambda _: "piper")
    engine = main.PiperSynthesizer("piper", str(pt), str(en), 5)
    monkeypatch.setattr(main, "_synthesizer", engine)
    return engine


@pytest.mark.parametrize("language,scale", [("en", "1.2"), ("pt", "1.2"), ("en", "0.5"), ("en", "2.0"), ("en", None), ("pt", "invalid")])
def test_language_model_and_length_scale(monkeypatch, configured_piper, language, scale):
    if scale is None:
        monkeypatch.delenv("PIPER_EN_LENGTH_SCALE", raising=False)
    else:
        monkeypatch.setenv("PIPER_EN_LENGTH_SCALE", scale)
    paths = []

    def fake_run(command, **kwargs):
        assert command[command.index("--model") + 1] == configured_piper.models[language]
        assert not kwargs.get("shell", False)
        assert kwargs["input"] == "Hello; --model"
        if language == "en":
            assert command[command.index("--length-scale") + 1] == (scale or "1.0")
        else:
            assert "--length-scale" not in command
        output = Path(command[command.index("--output_file") + 1])
        paths.append(output)
        output.write_bytes(b"RIFFwav")
        return type("Result", (), {"returncode": 0})()

    monkeypatch.setattr(main.subprocess, "run", fake_run)
    response = TestClient(main.app).post("/synthesize", json={"text": "Hello; --model", "language": language})
    assert response.status_code == 200
    assert response.content == b"RIFFwav"
    assert paths and all(not path.exists() for path in paths)


@pytest.mark.parametrize("scale", ["", "invalid", "nan", "inf", "-inf", "0", "-1", "0.49", "2.01", "1.2; command"])
def test_invalid_length_scale_is_generic_and_does_not_execute(monkeypatch, configured_piper, caplog, scale):
    monkeypatch.setenv("PIPER_EN_LENGTH_SCALE", scale)

    def forbidden(*args, **kwargs):
        pytest.fail("Invalid configuration must not execute Piper or create a temporary file")

    monkeypatch.setattr(main.subprocess, "run", forbidden)
    monkeypatch.setattr(main.tempfile, "NamedTemporaryFile", forbidden)
    response = TestClient(main.app).post("/synthesize", json={"text": "Hello", "language": "en"})
    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to synthesize speech"}
    assert "PIPER_LENGTH_SCALE_INVALID" in caplog.text


@pytest.mark.parametrize("failure", ["timeout", "exit", "empty", "oserror"])
def test_temporary_audio_removed_on_failure(monkeypatch, configured_piper, failure):
    monkeypatch.setenv("PIPER_EN_LENGTH_SCALE", "1.2")
    paths = []

    def fake_run(command, **kwargs):
        paths.append(Path(command[command.index("--output_file") + 1]))
        if failure == "timeout":
            raise main.subprocess.TimeoutExpired(command, 5)
        if failure == "oserror":
            raise OSError("private detail")
        return type("Result", (), {"returncode": 1 if failure == "exit" else 0})()

    monkeypatch.setattr(main.subprocess, "run", fake_run)
    response = TestClient(main.app).post("/synthesize", json={"text": "Hello", "language": "en"})
    assert response.status_code == 500
    assert response.json() == {"detail": "Unable to synthesize speech"}
    assert paths and all(not path.exists() for path in paths)
