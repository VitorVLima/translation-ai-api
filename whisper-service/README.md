# EnglishAI Whisper Service

Serviço local independente de Speech-to-Text usando `faster-whisper`. O modelo é carregado uma única vez, na primeira transcrição, e reutilizado nas chamadas seguintes.

Padrao: modelo `small`, CPU e `int8`. O modelo `small` tende a reconhecer melhor gravacoes curtas e com ruido, mas consome mais memoria e pode ser mais lento que `base`. Para voltar ao modelo `base`, defina `WHISPER_MODEL=base`. Os valores podem ser alterados por `WHISPER_MODEL`, `WHISPER_DEVICE` e `WHISPER_COMPUTE_TYPE`. O limite padrao e 20 MB (`WHISPER_MAX_FILE_SIZE_MB`).

## Configuração local e execução no Windows

Na instalação inicial, crie o ambiente virtual e instale as dependências:

```powershell
cd whisper-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8001
```

A configuração local fica em `whisper-service/.env`, ignorado pelo Git. Para uma instalação nova, copie `.env.example` para `.env` e ajuste os valores; preserve um `.env` já configurado. O `.env.example` é um template versionável, sem caminhos pessoais ou segredos.

O serviço carrega o `.env` ao lado de `main.py`, independentemente do diretório do terminal, antes de ler as configurações. Variáveis externas têm precedência. Não é necessário executar `set WHISPER_...` a cada terminal.

| Variável | Padrão | Uso |
| --- | --- | --- |
| `WHISPER_MODEL` | `small` | Modelo existente ou caminho local; preserve sua escolha |
| `WHISPER_DEVICE` | `cpu` | Dispositivo de inferência |
| `WHISPER_COMPUTE_TYPE` | `int8` | Tipo de computação |
| `WHISPER_MAX_FILE_SIZE_MB` | `20` | Limite do upload em MB |
| `WHISPER_PRELOAD_MODEL` | `false` | Carrega o modelo no startup, sem transcrever |
| `WHISPER_LOG_LEVEL` | `INFO` | Nível de logs |

Depois de configurado, basta iniciar no Prompt de Comando (CMD):

```bat
cd whisper-service
.venv\Scripts\activate.bat
uvicorn main:app --host 127.0.0.1 --port 8001
```

No PowerShell, use `.venv\Scripts\Activate.ps1` para ativar o ambiente. Não é necessário baixar ou trocar o modelo para configurar o `.env`.

Verifique `http://127.0.0.1:8001/health` (deve retornar `{"status":"ok"}`).

## Transcrever

O endpoint é `POST /transcribe` usando `multipart/form-data`, com o campo obrigatório `file`:

```powershell
curl.exe -X POST http://127.0.0.1:8001/transcribe -F "file=@C:\caminho\audio.wav"
```

Quando o aplicativo já conhece o idioma, informe-o para evitar erros de detecção em gravações curtas:

```powershell
# Português
curl.exe -X POST http://127.0.0.1:8001/transcribe -F "file=@C:\caminho\audio.wav" -F "language=pt"

# Inglês
curl.exe -X POST http://127.0.0.1:8001/transcribe -F "file=@C:\caminho\audio.wav" -F "language=en"
```

Sem `language`, o faster-whisper detecta automaticamente. Com `language`, somente `pt` e `en` são aceitos e o valor é passado diretamente ao modelo.

São aceitos `.wav`, `.mp3`, `.m4a`, `.webm` e `.ogg`. A primeira execução pode baixar o modelo do Hugging Face. O arquivo enviado é temporário e removido após sucesso ou erro; nenhuma transcrição é persistida. Este serviço ainda não está integrado ao Spring Boot nem à UI.

Para testar: `pytest -v`.
