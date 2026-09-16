# EnglishAI Piper Service

Servico local independente de Text-to-Speech usando Piper. O endpoint recebe texto e devolve diretamente um arquivo WAV. Nenhum audio e persistido.

## Windows PowerShell

```powershell
cd piper-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Configuração local

`piper-service/.env` contém a configuração local e é ignorado pelo Git. `.env.example` é o template versionável, sem caminhos pessoais ou segredos. Em uma instalação nova, copie o template para `.env` e indique os arquivos já instalados. Preserve um `.env` existente e seus caminhos.

O serviço carrega explicitamente o `.env` ao lado de `main.py`, antes de ler as configurações, independentemente do diretório do terminal. Variáveis externas têm precedência; não é necessário executar `set` ou `$env:` a cada terminal.

| Variável | Padrão no código | Uso |
| --- | --- | --- |
| `PIPER_EXECUTABLE` | `piper` | Executável existente |
| `PIPER_EN_MODEL_PATH` | vazio | Caminho da voz EN `en_US-lessac-high.onnx` |
| `PIPER_PT_MODEL_PATH` | vazio | Caminho da voz PT `pt_BR-faber-medium.onnx` |
| `PIPER_MAX_TEXT_LENGTH` | `3000` | Limite de caracteres |
| `PIPER_SYNTHESIS_TIMEOUT_SECONDS` | `30` | Timeout da síntese em segundos |
| `PIPER_EN_LENGTH_SCALE` | `1.0` | Escala de duração aplicada somente ao inglês |
| `PIPER_WARMUP_ENABLED` | `false` | Sintetiza uma frase neutra de cada voz no startup |
| `PIPER_LOG_LEVEL` | `INFO` | Nível de logs |

Mantenha as vozes existentes e os respectivos `.onnx.json` juntos. Esta configuração não exige baixar ou substituir modelos.

`PIPER_EN_LENGTH_SCALE=1.0` mantém a velocidade normal; `PIPER_EN_LENGTH_SCALE=1.2` deixa a voz inglesa mais lenta. Valores maiores produzem fala mais lenta. O projeto aceita números finitos entre **0.5 e 2.0**, inclusive. Configuração inválida impede a execução inglesa, registra somente um código operacional seguro e retorna o erro público genérico existente. Português não recebe esse argumento e mantém a velocidade atual da voz.

O valor é passado como `--length-scale` para inglês. Requests antigos com apenas `text` e `language` preservam esse comportamento. Requests podem também informar `voice` (chave pública do modelo) e `speechRate` (0.75–1.25, padrão 1.0). O serviço converte a velocidade em duração: `length_scale = escala atual do idioma / speechRate`. Português usa base 1.0 e só recebe o argumento quando a velocidade muda. O Spring e o navegador não conhecem `length_scale`.

`GET /voices` retorna somente `key`, `displayName` e `language` para os modelos configurados e outros `.onnx` com prefixo `en_`/`pt_` nos mesmos diretórios, acompanhados de `.onnx.json`. Nenhum caminho é retornado. A síntese resolve chaves contra essa lista; caminhos fornecidos por clientes são rejeitados. Voz de outro idioma usa o modelo padrão do idioma solicitado. Uma voz selecionada que deixou de estar disponível causa erro genérico, sem revelar detalhes internos. O navegador acessa somente o Spring, que protege o catálogo com ADMIN/SUPER_ADMIN.

Depois de configurado, basta iniciar no Prompt de Comando (CMD):

```bat
cd piper-service
.venv\Scripts\activate.bat
uvicorn main:app --host 127.0.0.1 --port 8002
```

No PowerShell, use `.venv\Scripts\Activate.ps1`. Execute na pasta `piper-service` para carregar seu `main.py`, e não o do Whisper. Não adicione modelos ou `.env` ao Git.

## Endpoints

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8002/health
```

Sintese em ingles:

```powershell
$body = @{ text = "Hello, my name is Vitor and I am learning English."; language = "en" } | ConvertTo-Json
Invoke-WebRequest http://127.0.0.1:8002/synthesize -Method Post -ContentType "application/json" -Body $body -OutFile response-en.wav
```

Sintese em portugues:

```powershell
$body = @{ text = "Ola, meu nome e Vitor e estou aprendendo ingles."; language = "pt" } | ConvertTo-Json
Invoke-WebRequest http://127.0.0.1:8002/synthesize -Method Post -ContentType "application/json" -Body $body -OutFile response-pt.wav
```

`POST /synthesize` aceita somente `pt` e `en`, exige texto nao vazio e limita o texto a 3.000 caracteres por padrao (configuravel por `PIPER_MAX_TEXT_LENGTH`). O limite excedido retorna 413. A resposta e `audio/wav`, com `Content-Disposition: inline` e `Cache-Control: no-store`.

O servico usa `subprocess` sem shell, passa o texto por stdin e aplica timeout configuravel (`PIPER_SYNTHESIS_TIMEOUT_SECONDS`). Falhas do Piper retornam apenas `{"detail":"Unable to synthesize speech"}`. Logs registram somente idioma, tamanho do texto e resultado.

Para executar os testes sem Piper ou modelos reais:

```powershell
pytest -q
```
