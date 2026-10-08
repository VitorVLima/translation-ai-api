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

## Backend health and runtime avatars

The Backend exposes unauthenticated, status-only `GET /livez` and `GET /readyz` (also `/actuator/health/liveness` and `/actuator/health/readiness`). Liveness reflects the Spring process state; readiness also checks PostgreSQL. LLM, Whisper, Piper and SMTP are not contacted by probes. Other Actuator HTTP endpoints are unavailable, and JMX exposure is disabled. Existing AI timing/status logs remain the diagnostic source for provider failures.

Development stores administrative runtime avatar images under `./data/profile-images` relative to the Backend process working directory. Production with `SPRING_PROFILES_ACTIVE=prod` or `production` requires `AVATAR_IMAGE_STORAGE_DIR` to be an existing, writable **absolute** directory. When the Backend runs in a container, mount a persistent volume or bind mount at this path. The current `Backend/compose.yaml` starts only PostgreSQL, so it cannot mount files into an application container; configure the Backend's own deployment separately. Back up and restore the avatar directory together with PostgreSQL, since the database stores asset keys while the image bytes live in the directory. Before changing the configured path, copy existing runtime files from the old directory. Multiple Backend instances need the same shared storage or object storage; separate local directories will diverge.

## Email por ambiente

O desenvolvimento local e os testes automatizados podem usar `MAIL_PROVIDER=noop`; nesse modo nenhum email real é enviado. Para validar entrega, configure `MAIL_PROVIDER=smtp` com host, remetente e credenciais fornecidos fora do repositório. O profile Spring `prod` (ou `production`) exige SMTP autenticado com STARTTLS e falha na inicialização se o provider for `noop` ou faltar configuração. Ative o profile explicitamente no deploy com `SPRING_PROFILES_ACTIVE=prod` e injete `MAIL_PASSWORD` pelo gerenciador de segredos.

Os timeouts SMTP são `MAIL_SMTP_CONNECTION_TIMEOUT_MS=5000`, `MAIL_SMTP_WRITE_TIMEOUT_MS=5000` e `MAIL_SMTP_READ_TIMEOUT_MS=10000` por padrão. Os valores e as demais variáveis estão em `Backend/.env.example`. Um teste de entrega real para uma caixa controlada ainda é necessário no ambiente final; a suíte automatizada usa mocks.

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
