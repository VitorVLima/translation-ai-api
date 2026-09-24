# EnglishAI Local Development

| Service | Port |
|---|---:|
| Spring Boot | 8080 |
| PostgreSQL | 5434 |
| Whisper | 8001 |
| Piper | 8002 |
| Ollama | 11434 |
| dev-auth-ui | 5500 |

## Backend

```powershell
cd Backend
.\mvnw.cmd spring-boot:run
.\mvnw.cmd test
```

Flyway manages schema changes and Hibernate remains on ddl-auto=validate.

## Whisper and Piper

```bat
cd whisper-service
.venv\Scripts\activate.bat
uvicorn main:app --host 127.0.0.1 --port 8001
```

```bat
cd piper-service
.venv\Scripts\activate.bat
uvicorn main:app --host 127.0.0.1 --port 8002
```

Each service loads its own `.env`. Before the first local start, copy each service's `.env.example` to `.env` and configure it. Piper applies `PIPER_EN_LENGTH_SCALE` only to English; the code default is `1.0`, and a local `.env` can choose another supported value.

## Web clients

Serve dev-auth-ui on port 5500. Serve admin-ui separately with an authenticated ADMIN session. Backend authorization remains mandatory. Check JavaScript with `node --check dev-auth-ui/app.js`. Never version .env files, tokens, user images, WAV files or temporary benchmark artifacts.

### LAN development

`server.address` is intentionally unset, so Spring Boot uses its normal all-interface bind. To allow a phone on the same Wi-Fi, add the exact current frontend origin to the local `Backend/.env`; do not use a wildcard:

```properties
APP_CORS_ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500,http://localhost:5501,http://<IP-DO-PC>:5500
```

Substitua `<IP-DO-PC>` pelo IP LAN atual. Restart the Backend, then serve the UI with `python -m http.server 5500 --bind 0.0.0.0` from `dev-auth-ui`. The UI derives `http://<current-page-hostname>:8080` unless `window.ENGLISHAI_BACKEND_URL` is explicitly configured, which takes precedence for a deployed HTTPS API. Whisper and Piper remain optional for text-only flows, but must be available for STT and TTS respectively.
