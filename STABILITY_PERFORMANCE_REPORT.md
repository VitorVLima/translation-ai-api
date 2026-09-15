# EnglishAI — Sprint de estabilidade e performance

Data da coleta: 14/09/2026. Esta etapa adiciona medição e executa o benchmark quando há credenciais e áudio fornecidos de forma segura; não aplica otimizações estruturais.

## Instrumentação e arquivos

- `Backend/src/main/java/com/example/com/englishai/backend/infrastructure/metrics/AiMetrics.java` registra operação, provider, duração monotônica e status, sem conteúdo sensível.
- Providers Whisper, Piper, Ollama e Gemini registram duração; streaming registra primeiro chunk e duração total.
- `ConversationController` registra primeiro token e duração total do SSE.
- `dev-auth-ui/app.js` e `styles.css` exibem métricas somente no painel de desenvolvimento.
- `scripts/benchmark_pipeline.py` executa STT → chat SSE → TTS autenticado, sem retry, sem persistir token, texto ou áudio.

Definições: STT mede o POST completo; first token mede o primeiro evento `token` não vazio; chat total termina no evento `complete`; TTS termina após receber o WAV; pipeline começa imediatamente antes do POST de STT e termina após receber todo o WAV, excluindo gravação e reprodução.

## Benchmark completo

**BENCHMARK BLOCKED BY AUTHENTICATION**

O script foi preparado, mas não há `ENGLISHAI_BENCHMARK_TOKEN` nem o par seguro `ENGLISHAI_BENCHMARK_EMAIL`/`ENGLISHAI_BENCHMARK_PASSWORD` disponível nesta sessão. Também não há áudio de fala não sensível fornecido para `ENGLISHAI_BENCHMARK_AUDIO_EN` e `ENGLISHAI_BENCHMARK_AUDIO_PT`. Nenhum resultado EN/PT foi inventado.

Execute depois de fornecer token e os mesmos arquivos WAV por idioma:

CMD:
```bat
set ENGLISHAI_BENCHMARK_TOKEN=<token>
set ENGLISHAI_BENCHMARK_AUDIO_EN=C:\caminho\benchmark-en.wav
set ENGLISHAI_BENCHMARK_AUDIO_PT=C:\caminho\benchmark-pt.wav
python scripts\benchmark_pipeline.py
```

PowerShell:
```powershell
$env:ENGLISHAI_BENCHMARK_TOKEN="<token>"
$env:ENGLISHAI_BENCHMARK_AUDIO_EN="C:\caminho\benchmark-en.wav"
$env:ENGLISHAI_BENCHMARK_AUDIO_PT="C:\caminho\benchmark-pt.wav"
python scripts/benchmark_pipeline.py
```

O script imprime apenas tempos, status e categorias de erro. Não registra prompts, transcrições, replies, tokens, bytes WAV ou URLs.

## Dados locais disponíveis

| Serviço | Resultado |
| --- | --- |
| Whisper `GET /health` | HTTP 200, aproximadamente 330 ms |
| Piper `GET /health` | HTTP 200, aproximadamente 389 ms |
| Spring `GET /health` | HTTP 401; processo respondeu e a rota permanece protegida |
| Ollama `/api/ps` | nenhum modelo carregado durante a observação |

Medição direta anterior do Piper: EN, 5 ciclos, mínimo 2,899 s, máximo 14,439 s, média 5,682 s; PT, 3 ciclos, mínimo 2,418 s, máximo 2,589 s, média 2,489 s. A primeira EN foi um outlier cold-ish. Isso não permite afirmar o maior gargalo do pipeline completo.

## Timeouts atuais

| Componente | Conexão | Resposta/execução |
| --- | ---: | ---: |
| LLM | 5 s | 120 s |
| STT → Whisper | 5 s | 120 s |
| TTS → Piper | 5 s | 60 s |
| Piper subprocesso | — | 30 s |
| SSE Spring | — | 130 s |

Os valores não foram alterados nem comparados a percentis do pipeline por falta de autenticação/áudio.

## Erros, retry e memória

Os contratos atuais continuam mapeando 400, 401, 413, 415, 429, 500/503, timeout, conexão recusada, resposta vazia, JSON inválido e SSE interrompido para respostas públicas genéricas. Não foi adicionado retry automático. JSON inválido do LLM pode ser avaliado no futuro; chat não deve ser repetido sem idempotência, e STT/TTS exigem análise de custo e duplicação.

Whisper carrega o modelo sob demanda e o mantém em memória; Piper abre subprocesso por síntese; Ollama, Spring e PostgreSQL mantêm seus próprios processos/buffers. Para observação local no Windows: `Get-Process python,java | Select-Object ProcessName,Id,WorkingSet64`, `Get-Process ollama -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64` e `docker stats` quando aplicável.

## Auditoria de API v1

Os endpoints `/api/v1/transcriptions`, `/api/v1/chat/stream`, `/api/v1/speech`, `/api/v1/translate`, `/api/v1/correct`, `/api/v1/correct/explain` e autenticação/refresh permanecem sem alteração. Antes de congelar a API para React Native, documentar explicitamente o schema/eventos SSE e um identificador de correlação; documentar que `/speech` retorna WAV em sucesso e JSON de erro; documentar semântica do idioma retornado por STT. A ausência de idempotency key no chat torna retry automático inseguro.

## Recomendações (não implementadas)

1. **Alto impacto, complexidade média, risco médio:** medir cold/warm controlado e avaliar worker persistente/warm-up para Piper e Whisper.
2. **Alto impacto, complexidade média, risco médio:** coletar percentis por provider LLM e investigar o primeiro token.
3. **Médio impacto, complexidade baixa, risco baixo:** adicionar correlação apenas quando houver contrato aprovado.

Não recomendar nesta fase: trocar modelos/vozes, cache, Redis, paralelismo, retry geral, WebSocket, filas ou alteração arbitrária de timeout.

## Validação

- Backend `mvn test`: BUILD SUCCESS, 296 testes, 0 falhas, 0 erros.
- Whisper `pytest -q`: 17 passed.
- Piper `pytest -q`: 32 passed.
- Frontend `node --check dev-auth-ui/app.js`: passou.
- `python scripts/benchmark_pipeline.py --en-cycles 5 --pt-cycles 3`: bloqueado de forma segura por credenciais ausentes.
- Nenhum modelo foi baixado ou substituído; nenhum endpoint ou contrato foi alterado.

## LOW-RISK LATENCY OPTIMIZATION

### Mudanças aplicadas

- Piper agora possui `PIPER_WARMUP_ENABLED`, desabilitado no template e habilitado no `.env` local. No startup, executa uma síntese curta para EN e PT, descarta o áudio e registra apenas `AI_WARMUP` com status e duração. `/health` continua sem síntese.
- Whisper agora possui `WHISPER_PRELOAD_MODEL`, desabilitado no template e habilitado no `.env` local. No startup, carrega o `WhisperModel` uma vez, sem transcrever. `/health` continua leve.
- Foram adicionados testes unitários para warm-up/preload habilitado, desabilitado e com falha. Os timeouts, modelos, vozes, endpoints e contratos não foram alterados.

### Trade-off e impacto

O custo de startup aumenta quando as opções estão habilitadas, em troca de reduzir o custo da primeira requisição real. A execução é limitada pelo timeout de síntese do Piper; falhas são registradas sem expor detalhes e não impedem o serviço de continuar. Não houve benchmark real pós-reinício nesta sessão porque não há áudio de fala e credencial para o pipeline autenticado. Portanto, a redução da primeira chamada ainda precisa ser medida.

### Análise dos próximos gargalos

O outlier EN anterior é compatível com inicialização do executável e carregamento do modelo em cada subprocesso. Um worker Piper persistente provavelmente teria impacto maior, mas exige mudança estrutural e ficou apenas recomendado. O preload Whisper transfere o custo para o startup, sem trocar `small/cpu/int8`. Ollama continua sem alteração.
