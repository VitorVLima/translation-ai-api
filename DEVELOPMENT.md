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
./mvnw spring-boot:run
./mvnw test
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

Each service loads its own .env. Piper uses PIPER_EN_LENGTH_SCALE=1.2 for a slower English voice only.

## Web clients

Serve dev-auth-ui on port 5500. Serve admin-ui separately with an authenticated ADMIN session. Backend authorization remains mandatory. Check JavaScript with `node --check dev-auth-ui/app.js`. Never version .env files, tokens, user images, WAV files or temporary benchmark artifacts.
