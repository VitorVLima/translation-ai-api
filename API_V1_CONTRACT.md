# EnglishAI API v1 — Contrato para clientes mobile

## Meu Progresso (Etapa 3)

`GET /api/v1/progress?period=ALL_TIME` (período omitido = `ALL_TIME`) e `GET /api/v1/progress/timeline` são endpoints autenticados e somente leitura. As fontes de verdade são `conversation_evaluations`, atividades `reading_activities` concluídas e `user_vocabulary_words`; não existe tabela geral nem `overallEnglishScore`. O bloco de vocabulário retorna `totalWords`, `newCount`, `reviewingCount`, `learnedCount`, `masteredCount` e `dueForReview`; `totalWords` é a soma dos quatro estados.

O mesmo response inclui `dailyGoal`, calculado para o dia UTC atual: `{date, completed, total, vocabulary:{completed}, conversation:{completed}, reading:{completed}, goalCompleted}`. `total` é sempre `3`, `completed` é a soma limitada a uma ocorrência por categoria e `goalCompleted` só é `true` em `3/3`. As três categorias fixas são Vocabulary, Conversation e Reading; Tradução e Correção não contam. A meta diária mede conclusão, não desempenho. Vocabulário conta somente uma lição do dia com `completedAt`; Conversation conta uma ou mais conversas com `endedAt` no dia; Reading conta uma ou mais atividades com status `SUCCESS` ou `NEEDS_PRACTICE` e `completedAt` no dia.

O bloco aditivo `weeklyGoals` usa a mesma regra e o mesmo fuso UTC de `dailyGoal`: `{weekStart, weekEnd, completedDays, totalDays, days}`. `days` sempre contém os sete dias da semana corrente, de segunda a domingo, na forma completa de `dailyGoal`; `completedDays` conta somente dias com as três categorias concluídas e `totalDays` é `7`. O histórico é agregado diretamente das tabelas de origem e não é persistido como métrica derivada.

Os períodos são `ALL_TIME`, `LAST_7_DAYS` (janela móvel), `CURRENT_MONTH` (primeiro dia do mês até agora) e `LAST_30_DAYS` (janela móvel). O cálculo usa `Clock` no Backend e UTC, não o relógio do navegador. Períodos finitos retornam comparação com o intervalo anterior; `CURRENT_MONTH` compara o início do mês atual até o dia equivalente do mês anterior, limitado ao tamanho daquele mês. Deltas de percentuais são pontos percentuais e ficam nulos quando não há amostra anterior.

A conversação agrega avaliações persistidas por resultado, médias de comunicação, gramática, vocabulário, fluência e relevância, além da dificuldade. `averageRelevance` pode ser nulo quando o período contém somente avaliações legadas anteriores a essa dimensão. A leitura agrega apenas `SUCCESS`/`NEEDS_PRACTICE` concluídas, por resultado e dificuldade. O vocabulário retorna o estado atual por status, palavras vencidas e, em períodos finitos, apenas `firstSeenAt` e a revisão mais recente por `lastReviewedAt`; não inventa contagem histórica de sessões nem de transições para `MASTERED`. A timeline retorna sempre seis meses cronológicos, com médias nulas nos meses sem atividade.

Status: revisão de contrato; extensões aditivas de TTS e cenários descritas abaixo.

## Conclusão e avaliação de conversas (Etapa 2)

**CONVERSA INICIADA ≠ CONVERSA CONCLUÍDA.** Navegar, ouvir áudio ou fechar a página não conclui a atividade.

- `POST /api/v1/conversations/{id}/complete`: autenticado, sem corpo. Identidade vem do principal; conversa alheia/inexistente retorna 404. Exige pelo menos cinco mensagens `USER` contendo letras; mensagens vazias, apenas números/pontuação e mensagens da IA não contam. A verificação é determinística, anterior à LLM.
- Participação insuficiente retorna 200: `{"conversationId":"uuid","status":"INSUFFICIENT","minimumUserMessages":5,"currentUserMessages":2}`. Não chama LLM, não persiste avaliação e mantém a conversa ativa.
- Avaliação válida retorna `conversationId`, `status`, `scores` (`communication`, `grammar`, `vocabulary`, `fluency`, `overall`), `strengths`, `improvements` e `evaluatedAt`. Scores são inteiros 0..100; cada lista de feedback tem até três textos de até 500 caracteres, em português brasileiro. Exemplos linguísticos permanecem em inglês.
- Backend calcula `overall = (communication + grammar + vocabulary + fluency + 2) / 4`, com divisão inteira (arredondamento de metade para cima). **SUCCESS_THRESHOLD = 60**: resultado >=60 é `SUCCESS`; abaixo é `NEEDS_PRACTICE`. Ambos encerram a conversa. **INSUFFICIENT ≠ NEEDS_PRACTICE**.
- `GET /api/v1/conversations/{id}` preserva `conversation` e `messages`, adicionando `evaluation` (null antes da avaliação). O DTO de conversa, inclusive na listagem, adiciona `endedAt` nullable. Reabrir histórico não chama a LLM.
- Repetir `/complete` devolve o resultado persistido, sem nova chamada LLM. Há uma única avaliação por conversa. Uma conversa encerrada não aceita mensagens, inclusive streaming (400). Encerramento durante geração pendente também retorna 400; a UI bloqueia a ação enquanto o turno está incompleto. Erro do provider/JSON inválido retorna 503 e mantém a conversa ativa para retry.
- `FLUENCY` significa continuidade linguística, naturalidade e capacidade de manter a interação. Não mede pronúncia, sotaque, velocidade ou pausas acústicas. Avaliação relativa à dificuldade e ao cenário; não altera EnglishLevel nem infere CEFR.
- Texto e voz usam o mesmo histórico textual persistido. Áudio não é persistido. Conversas antigas não são avaliadas automaticamente; podem ser concluídas por solicitação explícita quando elegíveis.

## Atualização: limite de conversas e voz por cenário

- `POST /api/v1/conversations`: máximo de três conversas por usuário, garantido no Backend. Com três ou mais retorna **409** `{"message":"You can have at most 3 conversations."}` antes da LLM. Exclusão libera vaga. A gravação revalida o limite sob bloqueio por usuário; chamadas simultâneas podem gerar aberturas concorrentes, mas não ultrapassam o limite persistido. O request aceita `difficulty` controlado (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`), com `INTERMEDIATE` como padrão.
- `POST /api/v1/speech`: preserva `text` e `language` e aceita `conversationId` opcional. Com id, exige ownership (404 para conversa alheia/inexistente) e usa idioma persistido e configurações atuais do cenário. Sem id, mantém o TTS genérico de Tradução/Correção. Sucesso continua WAV com `no-store`.
- `GET /api/v1/admin/tts/voices`: ADMIN/SUPER_ADMIN; retorna `[{"key":"en_US-lessac-high","displayName":"Lessac High","language":"en"}, ...]` com modelos disponíveis, sem caminhos. Provider indisponível retorna o erro TTS 503 existente.
- Requests/responses administrativos de cenário acrescentam `ttsVoice` e `speechRate`. Velocidade aceita **0.75–1.25**; padrão **1.0**. Voz ausente/nula na edição preserva o valor existente; `""` volta ao padrão do idioma. Campos omitidos em clientes antigos preservam os valores. Chave nova deve existir no catálogo de vozes. Resposta usa `null` para voz padrão.
- A velocidade é relativa à configuração atual do provider. Alterações administrativas se aplicam às conversas existentes no próximo TTS. Voz com idioma diferente da conversa usa o padrão do idioma da conversa. Nenhum desses campos altera a identidade pública resolvida pelo avatar.


## Vocabulário standalone

- `GET /api/v1/vocabulary/today`: endpoint autenticado; retorna ou cria a lição do usuário para o dia UTC, com exatamente dez palavras em inglês, traduções/exemplos em português e progresso permanente por usuário/palavra normalizada. A unicidade `(user_id, lesson_date)` impede duas lições no mesmo dia; lições legadas incompletas são complementadas pelo Backend. A resposta acrescenta `progress: {quizCompleted,quizScore,writingCompleted,completedAt}`.
- `POST /api/v1/vocabulary/quiz`: request `{lessonId,answers:[{wordId,selectedWordId}]}` com exatamente três respostas. As perguntas são as três primeiras palavras ordenadas da lição; todos os ids precisam pertencer à lição autenticada. O Backend calcula e persiste o score `0..3`, atualiza os três itens e devolve `{score,total,progress}`. Reenvio depois do sucesso devolve o resultado persistido sem incrementar contadores novamente.
- `POST /api/v1/vocabulary/evaluate`: request `{lessonId,wordId,sentence}`; exige quiz concluído, valida ownership e avalia uma frase em inglês com status `CORRECT`, `NEEDS_IMPROVEMENT` ou `INCORRECT`, explicação em português e campos opcionais em inglês. Uma avaliação válida marca a prática escrita e, junto com o quiz, define `completedAt`; nova avaliação da mesma lição concluída é rejeitada antes da LLM.
- O TTS reutiliza `POST /api/v1/speech` com `language: "en"`. A conclusão fica em `vocabulary_lessons` e sobrevive a refresh, logout e outro dispositivo.
- O progresso permanente usa exclusivamente os estados `NEW`, `REVIEWING`, `LEARNED` e `MASTERED`. `NEW` não possui evidência avaliada; revisões corretas avançam pelos estágios espaçados de 1, 3, 7, 14 e 30 dias; erros reduzem o estágio e podem retirar uma palavra de `MASTERED`. Registros legados `LEARNING` são convertidos para `LEARNED` pela V33.
## Leitura standalone

Endpoints autenticados, com `Cache-Control: no-store`. As atividades e perguntas são persistidas para permitir retomada; não há persistência de áudio ou tradução:

- `POST /api/v1/reading/generate`: `{"difficulty":"INTERMEDIATE","topic":"TRAVEL"}` → `{"activityId":"...","title":"A Weekend in London","text":"English passage...","difficulty":"INTERMEDIATE","topic":"TRAVEL"}`. A atividade começa como `IN_PROGRESS`; o título em inglês é gerado junto do texto e persistido.
- `GET /api/v1/reading`: lista apenas as atividades do usuário autenticado, mais recentes primeiro, sem o texto completo. O resumo inclui `activityId`, `title`, dificuldade, tema, status, contagem de perguntas, resultado disponível e timestamps.
- `GET /api/v1/reading/{activityId}`: retorna `title`, texto, metadados persistidos, resultado agregado e as perguntas já persistidas da própria atividade. Não gera texto nem perguntas. Enquanto o status for `IN_PROGRESS`, `correctOption` e `explanation` não são retornados; após a conclusão, o feedback persistido pode ser reconstruído.
- Dificuldade reutiliza `ConversationDifficulty`: `BEGINNER` (A1–A2, alvo 80–130 palavras), `INTERMEDIATE` (B1–B2, 130–220), `ADVANCED` (C1–C2, 200–300). Tema: `DAILY_LIFE`, `TRAVEL`, `WORK`, `TECHNOLOGY`, `CULTURE`, `RANDOM`. Ambos são obrigatórios; valores inválidos retornam 400.
- Máximo absoluto validado: 300 palavras separadas por espaços Unicode e 5000 caracteres. Resposta inválida, acima do limite ou declarada em idioma diferente de `en` retorna o erro de IA 503 existente. O prompt exige inglês; a indicação estruturada de idioma vem do provider, não de um detector linguístico independente.
- `POST /api/v1/reading/hint`: `{"text":"English passage...","difficulty":"INTERMEDIATE"}` → `{"items":[{"expression":"English excerpt","explanation":"Explicação em português brasileiro.","type":"EXPRESSION"}]}`. Texto obrigatório, com os mesmos limites; a dificuldade é a do texto gerado. A seleção considera o nível CEFR e retorna até 10 dicas em BEGINNER, 7 em INTERMEDIATE ou 4 em ADVANCED, sem completar uma quantidade fixa.
- Leituras novas persistem as dicas selecionadas no momento da geração. `GET /api/v1/reading/{activityId}` inclui `hints` (lista, ou `null` em registros antigos ainda sem dicas). `GET /api/v1/reading/{activityId}/hints` exige autenticação e ownership; reutiliza as dicas persistidas ou, para registros antigos e falhas transitórias na geração inicial, gera e persiste uma vez. O endpoint original `POST /hint` permanece disponível para clientes existentes.
- `POST /api/v1/reading/questions`: request with `activityId` (preferred for persisted activities) or the legacy `text` and controlled `difficulty`; returns exactly three questions, each with four English options. For an `IN_PROGRESS` persisted activity, `correctOption` and `explanation` are omitted until submission; after completion, persisted feedback may be returned. Invalid provider structure returns `{"questions":[]}` so the client can retry.
- Dicas solicitam 3–5 itens relevantes ao nível, sem traduzir integralmente o texto. O parser aceita no máximo cinco itens válidos; cada expressão precisa ocorrer no texto (até 120 caracteres), explicação até 600 caracteres. Tipos: `VOCABULARY`, `PHRASAL_VERB`, `EXPRESSION`, `IDIOM`, `GRAMMAR`, `PRONUNCIATION`. Estrutura malformada retorna `{"items":[]}`; indisponibilidade do provider retorna 503. A UI mantém o texto e permite tentar novamente.
- Áudio somente sob ação do usuário: `POST /api/v1/speech` com `{"text":"English passage...","language":"en"}`, sem `conversationId`, usando a voz inglesa padrão. Nenhum WAV é persistido.

## 1. Regras gerais

`POST /api/v1/translate` mantém o campo `translation` e acrescenta `enrichment` para textos curtos (até 20 palavras, inclusive), com `usage` e até três exemplos; textos acima desse limite retornam `enrichment: null`. `POST /api/v1/correct` mantém `correctedText` e acrescenta `status` (`CORRECTED`, `CORRECT_WITH_SUGGESTIONS` ou `CORRECT`), explicação, dica, alternativas e exemplos quando relevantes.

- Base URL de desenvolvimento: `http://localhost:8080`, configurável por ambiente.
- Todos os endpoints de produto usam `/api/v1`.
- JSON usa `Content-Type: application/json` e nomes camelCase.
- Rotas protegidas usam `Authorization: Bearer <accessToken>`.
- Idiomas aceitos são somente `pt` (português) e `en` (inglês). Clientes devem enviar minúsculas.
- Não persistir tokens, prompts, respostas ou áudio em logs.

## 2. Formato de erro

Erros de domínio retornam `{"message":"mensagem"}`. Erros de validação retornam `{"message":"Validation failed","errors":{"field":"mensagem"}}`. O cliente deve usar o status e o campo `message`, sem depender de detalhes internos.

| Status | Uso |
|---:|---|
| 400 | JSON, campo, idioma, arquivo ou conteúdo inválido |
| 401 | token ausente/expirado/inválido, credencial inválida ou refresh inválido |
| 403 | email não verificado |
| 404 | rota/recurso não encontrado; formato pode ser o padrão Spring |
| 409 | e-mail já existe ou conflito de identidade |
| 413 | upload STT ou texto acima do limite |
| 415 | áudio não suportado |
| 429 | rate limit, com `Retry-After` em segundos |
| 500 | falha interna não mapeada |
| 503 | provider de IA/STT/TTS indisponível, timeout ou resposta inválida |

## 3. Authentication

`POST /api/v1/auth/login` é público. Request: `{"email":"user@example.com","password":"password"}`. Response 200: `{"user":{"id":"uuid","email":"user@example.com","username":"name","createdAt":"2026-01-01T00:00:00Z"},"accessToken":"...","refreshToken":"..."}`.

`POST /api/v1/auth/register` é público. Request: `{"email":"user@example.com","password":"password"}`. Response 201 é `UserResponse` (`id`, `email`, `username`, `createdAt`), com `username: null` até o setup. O nome é informado em `PUT /api/v1/users/me/profile/initial-setup` e armazenado em `users.username`. A senha tem 6–100 caracteres e no máximo 72 bytes UTF-8.

Google/OIDC: `POST /api/v1/auth/google/nonce` retorna 200 `{"nonce":"..."}`; `POST /api/v1/auth/google` recebe `{"credential":"...","nonce":"..."}` e retorna o formato de Login. Credencial ou nonce inválidos retornam 401.

Verificação e recuperação: `POST /api/v1/auth/verify-email` recebe email/code e retorna 204 somente ao confirmar pela primeira vez com código válido; conta inexistente, conta já verificada e código inválido/expirado retornam o mesmo 400 genérico (`{"message":"Invalid or expired verification code"}`). Clientes não devem interpretar esse erro como prova de que a conta existe ou não; podem oferecer login ou reenvio. `POST /api/v1/auth/resend-verification` recebe email e retorna 204; `POST /api/v1/auth/forgot-password` recebe email e retorna 204; `POST /api/v1/auth/validate-reset-code` recebe email/code e retorna 204 apenas quando o código de recuperação está válido, sem consumi-lo ou conceder autorização; `POST /api/v1/auth/reset-password` recebe email/code/newPassword, revalida e consome o código, e retorna 204. Códigos têm seis dígitos. Forgot e resend mantêm 204 para contas inexistentes e para falhas de entrega SMTP, sem revelar existência por status ou corpo. Cadastro com falha de entrega após commit retorna 503 genérico; a conta e o código permanecem persistidos, e o usuário pode solicitar reenvio.

`POST /api/v1/auth/refresh` é público. Request `{"refreshToken":"..."}`; response 200 `{"accessToken":"...","refreshToken":"..."}`. O refresh token é rotacionado dentro da mesma família de sessão. Reuso, revogação ou expiração retornam 401; apague ambos os tokens e exija novo login. Access JWTs agora contêm a identificação da família, validada no banco a cada requisição protegida. JWT legado sem essa identificação recebe 401; se o refresh token da sessão ainda estiver válido, o cliente pode rotacioná-lo uma vez e repetir a requisição com o novo access token. Falha do refresh exige limpar a sessão, sem repetir automaticamente um token de resultado ambíguo.

`POST /api/v1/auth/logout` recebe `{"refreshToken":"..."}` e retorna 204. Limpe tokens localmente independentemente da resposta. O logout revoga imediatamente os access tokens daquela família, sem afetar outra sessão do mesmo usuário. A redefinição de senha revoga todas as famílias anteriores. `GET /api/v1/users/me` é protegido e retorna `UserResponse`. Access JWT padrão: 900 s; refresh: 604800 s; família: 2592000 s.

## 4. Languages

Translate usa `sourceLanguage` e `targetLanguage`; correct, explain, chat e TTS usam `language`. Translate, correct, explain, chat e TTS exigem idioma. STT aceita `language` opcional; ausente significa detecção automática.

## 5. Translation

`POST /api/v1/translate` (protegido). Request `{"text":"Olá","sourceLanguage":"pt","targetLanguage":"en"}`. Response 200 `{"translation":"Hello"}`. Máximo: 5000 caracteres.

## 6. Correction

`POST /api/v1/correct` (protegido). Corrige exclusivamente texto em inglês; requests com `language` diferente de `en` retornam 400. Request `{"text":"I go yesterday","language":"en"}`. Response 200 inclui `correctedText`, `status`, explicação, dica, alternativas e exemplos quando relevantes. Máximo: 5000 caracteres.

`POST /api/v1/correct/explain` (protegido). Request `{"originalText":"I go yesterday","correctedText":"I went yesterday","language":"en"}`. Response 200 `{"explanation":"..."}`. Cada texto: máximo 5000 caracteres.

## 7. Chat

`POST /api/v1/chat` (protegido). Request: `{"message":"Hello","language":"en","history":[{"role":"user","content":"Hi"},{"role":"assistant","content":"Hello!"}]}`. `history` é opcional, aceita no máximo 10 mensagens em ordem cronológica, com roles `user` ou `assistant`. Mensagem e cada content têm máximo 5000 caracteres.

Response 200: `{"reply":"How are you?","hasCorrection":false,"correctedText":null}`. Quando `hasCorrection=true`, `correctedText` contém somente a correção da mensagem atual e nunca substitui `reply`.

## 8. Chat streaming SSE

`POST /api/v1/chat/stream` (protegido), com `Authorization`, `Content-Type: application/json` e opcionalmente `Accept: text/event-stream`. O request é igual ao chat.

Response `Content-Type: text/event-stream`. Eventos normais:

```text
event: token
data: {"text":"How "}

event: token
data: {"text":"are you?"}

event: complete
data: {"hasCorrection":false,"correctedText":null}
```

Eventos são separados por linha em branco. Concatene `text` dos eventos `token`. `complete` indica reply final e metadados de correção. Falha envia `event: error` com `{"message":"AI service temporarily unavailable"}` e encerra. Encerramento sem `complete` é falha; não iniciar TTS.

POST + SSE é viável no React Native com fetch streaming ou biblioteca compatível. Muitas bibliotecas SSE presumem GET; validar a biblioteca é **RECOMMENDED BEFORE REACT NATIVE**, não um bloqueador. WebSocket não faz parte da v1.

## 9. STT

`POST /api/v1/transcriptions` (protegido), `multipart/form-data`:

- `file`: obrigatório; `.wav`, `.mp3`, `.m4a`, `.webm`, `.ogg`; content type `audio/*` ou `application/octet-stream`.
- `language`: opcional; ausente = detecção automática; `pt`/`en` = idioma explícito.

Limite: 20 MB. Response 200: `{"text":"Hello world","language":"en"}`. O idioma retornado é o resultado do provider e pode diferir quando houve detecção automática.

## 10. TTS

`POST /api/v1/speech` (protegido). Request JSON: `{"text":"Hello, my name is Vitor.","language":"en"}`. Texto máximo: 3000 caracteres.

Sucesso 200 é binário, não JSON: `Content-Type: audio/wav`, `Cache-Control: no-store`, `Content-Disposition: inline`. O mobile deve reproduzir os bytes em memória. Erros continuam JSON com `message`.

## 11. Limites

| Operação | Limite |
|---|---:|
| Translate text | 5000 caracteres |
| Correct text | 5000 caracteres |
| Explain originalText/correctedText | 5000 cada |
| Chat message | 5000 caracteres |
| Chat history | 10 mensagens; 5000 por content |
| STT audio | 20 MB |
| TTS text | 3000 caracteres |

## 12. Cache, CORS e rate limit

Translate, correct, explain, chat não streaming, STT e TTS enviam `Cache-Control: no-store`. Auth de tokens envia `no-store` e `Pragma: no-cache`; register, verify, resend, forgot, reset e users/me não definem explicitamente esses headers.

CORS usa uma allowlist explícita. Sem `APP_CORS_ALLOWED_ORIGINS`, as origens permitidas são `http://localhost:5500`, `http://127.0.0.1:5500` e `http://localhost:5501`. Quando a variável é definida, ela fornece a lista separada por vírgulas de origens exatas autorizadas; inclua também as origens locais que ainda devem funcionar.

Não há `allowedOrigins("*")`, `allowedOriginPatterns("*")` nem outro wildcard global. Métodos permitidos: GET, POST, PUT, PATCH, DELETE e OPTIONS. Headers permitidos: `Content-Type` e `Authorization`. `allowCredentials(false)` permanece intencional: clientes autenticados enviam `Authorization: Bearer <accessToken>`, e não cookies cross-origin.

Para desenvolvimento pela LAN, acrescente a origem exata da interface, por exemplo `http://<IP-DO-PC>:5500`, a `APP_CORS_ALLOWED_ORIGINS`, reinicie o Backend e mantenha a porta 8080 acessível na rede local. Um preflight OPTIONS dessa origem autorizada passa pela configuração CORS; uma origem desconhecida continua rejeitada. Isso é relevante para a UI web; React Native nativo normalmente não depende de CORS.

Rate limit local de autenticação: login 10/600 s, register 3/600 s, refresh 30/60 s, logout 30/60 s, verify 10/600 s, resend 5/600 s, reset 10/600 s e Google 10/600 s por IP. Operações de IA, STT e TTS têm limites locais por usuário e operação, além de limites simultâneos por instância. Quando saturadas, retornam `429` JSON `{"message":"Too many requests"}` com `Retry-After` em segundos, antes de chamar o provider. Os valores padrão e variáveis de produção estão em `Backend/.env.example`; múltiplas instâncias aplicam esses limites independentemente.

## 13. Nomenclatura e versionamento

As rotas de produto estão sob `/api/v1`; `/health` é exceção operacional dos serviços locais. A nomenclatura atual (`reply`, `correctedText`, `hasCorrection`, `translation`, `explanation`, `language`, `text`) não foi renomeada porque já é usada pelo cliente e é consistente.

## 14. Limitações e classificação

- SSE não possui request/correlation ID público nem schema versionado.
- Erros de rota inexistente/500 podem seguir o formato padrão do Spring.
- TTS alterna WAV em sucesso e JSON em erro; inspecione o status antes do body.
- Chat não possui idempotency key; não repetir automaticamente após falha ambígua.
- OpenAPI/Springdoc não está configurado; este Markdown é a fonte atual.

Não há **BLOCKER BEFORE REACT NATIVE** identificado. Documentar SSE/erros e validar biblioteca POST+SSE são **RECOMMENDED BEFORE REACT NATIVE**. Persistência e cache **CAN WAIT**.

## React Native Integration Checklist

- [ ] base URL configurável por ambiente
- [ ] access token em storage seguro
- [ ] refresh automático com rotação
- [ ] multipart STT
- [ ] POST SSE compatível
- [ ] WAV binary playback em memória
- [ ] estratégia de timeout
- [ ] erros offline/network
- [ ] logout limpa tokens, áudio e requisições
- [ ] não persistir prompts, replies ou áudio

## Administration

Rotas administrativas exigem access token de um usuário com role `ADMIN` derivada do banco. Sem token → 401; usuário comum → 403. Ocultar menu no frontend não é mecanismo de segurança.

Público autenticado: `GET /api/v1/avatars` lista somente avatares `enabled=true`, sem filesystem. `GET /api/v1/conversation-scenarios` lista somente cenários ativos e nunca retorna `behaviorInstructions`.

Admin: `GET /api/v1/admin/dashboard`, CRUD `GET/POST/PUT/DELETE /api/v1/admin/avatars` e `POST /api/v1/admin/avatars/upload` (multipart file, key, displayName) e CRUD `GET/POST/PUT/DELETE /api/v1/admin/conversation-scenarios`. DELETE desativa (`enabled=false`) em vez de apagar fisicamente. Avatar do assistant deve referenciar uma chave existente; configuração inválida retorna 400.

O painel web está em `admin-ui/`. A role inicial pode ser atribuída somente por `ADMIN_BOOTSTRAP_EMAIL` a um usuário existente, mediante configuração controlada e reinício do Backend. O dashboard expõe apenas contagens agregadas, nunca mensagens, prompts, áudio ou tokens. Cenários existentes são seedados pela migration e novas chaves podem ser cadastradas sem recompilar; conversas antigas mantêm sua chave estável.

## 15. User Profile e Onboarding

`GET /api/v1/users/me/profile` e `PUT /api/v1/users/me/profile` são protegidos. O PUT recebe `preferredName` opcional (até 100), `age` entre 13 e 120, `englishLevel` em `A1|A2|B1|B2|C1|C2` e `learningGoal` em `GENERAL|CONVERSATION|WORK|TRAVEL|STUDY`. A resposta inclui esses campos, `avatarType`, `avatarKey`, `onboardingCompleted`, `createdAt` e `updatedAt`. Usuários antigos sem linha de perfil recebem onboarding incompleto até salvar dados válidos.

## 15.1 Configuração inicial privada

`PUT /api/v1/users/me/profile/initial-setup` recebe `name`, `birthDate`, `englishLevel`, `learningGoal` e `avatarKey`; todos são obrigatórios para concluir normalmente. `avatarKey` aceita apenas os avatares ativos do usuário (`avatar_01` a `avatar_06`). `POST /api/v1/users/me/profile/initial-setup/skip` não recebe corpo: marca `initialSetupCompleted=true` para o principal autenticado e mantém os demais campos do perfil como estavam, inclusive valores nulos/default. A resposta é o perfil atualizado; o cliente só navega para Home após confirmar `initialSetupCompleted=true`.

A coluna histórica `preferred_language` criada pela V38 permanece no schema por compatibilidade, mas não integra DTOs, interface nem lógica de produto; a interface usa português fixo.

## 16. Avatar do usuário

`PUT /api/v1/users/me/profile/avatar/predefined` recebe `{"avatarKey":"avatar_03"}`. Chaves permitidas são as pré-definidas pelo aplicativo (`avatar_default`, `avatar_01` a `avatar_06`). O usuário escolhe sua própria chave, mas não escolhe a identidade do assistant.

`PUT /api/v1/users/me/profile/avatar` recebe multipart `file`, até 5 MB, somente JPEG, PNG ou WebP. O backend gera um identificador interno, valida assinatura básica, não usa o filename e não salva base64 no banco. `GET /api/v1/users/me/profile/avatar` entrega o arquivo customizado em memória com `Cache-Control: no-store`. Trocas removem o arquivo customizado anterior quando possível. SVG, path traversal e MIME não permitido são rejeitados.

O avatar do usuário é apenas identidade visual; nunca é enviado ao LLM, Whisper ou Piper. A implementação local usa abstração `ProfileImageStorage` com filesystem substituível futuramente por object storage.

## 17. Cenários e identidade do assistant

`GET /api/v1/conversation-scenarios` (protegido) retorna `FREE_TALK`, `JOB_INTERVIEW`, `FRIENDS`, `SELF_INTRODUCTION`, `RESTAURANT` e `TRAVEL`, cada um com `displayName`, `description`, `assistantDisplayName`, `assistantAvatarKey` e `assistantAvatarImageUrl` (URL relativa pública para a imagem do personagem). Esses metadados são definidos pelo desenvolvedor. O cliente não pode sobrescrever identidade do assistant.

## 18. Conversas persistentes

`POST /api/v1/conversations` recebe `{"scenario":"JOB_INTERVIEW","language":"en","difficulty":"INTERMEDIATE","interactionMode":"TEXT"}` e retorna id, cenário, idioma, dificuldade e modo persistidos, título determinístico, identidade visual e timestamps. `interactionMode` aceita `TEXT` ou `VOICE`; quando omitido, usa `TEXT` para compatibilidade com clientes anteriores. O modo aparece também em `GET /api/v1/conversations` (lista leve) e `GET /api/v1/conversations/{id}` (metadados e mensagens). `DELETE /api/v1/conversations/{id}` retorna 204. Conversas anteriores à V21 recebem `INTERMEDIATE`; V32 define `TEXT` para conversas anteriores à persistência do modo. Ambos os modos usam o mesmo histórico textual e os mesmos endpoints de mensagens, conclusão e avaliação; áudio não é persistido.

`POST /api/v1/conversations/{id}/messages` recebe `{"message":"Hello."}` e retorna o mesmo formato do chat (`reply`, `hasCorrection`, `correctedText`). O backend grava USER e ASSISTANT; `correctedText`, quando presente, pertence à mensagem USER semanticamente, embora seja retornado junto do resultado.

`POST /api/v1/conversations/{id}/messages/stream` mantém eventos SSE `token`, `complete` e `error` do contrato de chat. A mensagem USER é persistida antes da chamada ao provider; a ASSISTANT só é persistida após `complete`. Se o streaming falhar, não há resposta ASSISTANT parcial persistida e o cliente recebe erro genérico.

O contexto do LLM é montado no backend com perfil (nome preferido, CEFR e objetivo), cenário e no máximo as últimas 10 mensagens. O avatar nunca participa do prompt. A tabela pode conservar histórico completo, mas o provider não recebe histórico ilimitado. Ownership é sempre derivado do JWT; ids de outro usuário retornam recurso não encontrado. Exclusão usa cascade para mensagens.

## 19. Persistência e limitações do MVP

Migration `V12__create_profiles_and_conversations.sql` cria `user_profiles`, `conversations` e `conversation_messages` com FK, constraints e índices. Áudio original, WAV, tokens, prompts e system prompt não são persistidos. Concorrência de duas mensagens na mesma conversa ainda deve ser serializada pelo cliente; não há lock distribuído. Geração de título não chama LLM.


## Pol?tica atual de avatars

Usu?rios escolhem somente avatars predefinidos disponibilizados pelo EnglishAI. `PUT /api/v1/users/me/profile/avatar/predefined` permanece ativo. O antigo upload de avatar do usu?rio (`PUT /api/v1/users/me/profile/avatar`) e o GET de arquivo customizado n?o fazem mais parte do contrato p?blico. Uploads permanecem dispon?veis somente na Admin API para o cat?logo. Perfis legados com `CUSTOM` s?o normalizados para `PREDEFINED/avatar_default` pela migration V16. Um avatar desativado continua v?lido para perfis que j? o utilizam, mas n?o pode ser selecionado novamente.

## Role hierarchy and administration

`USER`, `ADMIN` and `SUPER_ADMIN` are cumulative (`USER < ADMIN < SUPER_ADMIN`). All authenticated roles may use normal profile, conversation, chat, STT and TTS endpoints. Catalog administration under `/api/v1/admin/` accepts ADMIN and SUPER_ADMIN. User management accepts only SUPER_ADMIN.

`GET /api/v1/users/me` includes the additive `role` field. `GET /api/v1/admin/users` returns minimal account metadata (`id`, `email`, `username`, `role`, `createdAt`) and never credentials or conversation data. `PATCH /api/v1/admin/users/{id}/role` accepts only `{ "role": "USER" }` or `{ "role": "ADMIN" }`; SUPER_ADMIN targets, self changes and attempts to assign SUPER_ADMIN are rejected. Role changes are read from the database on each administrative request; existing access tokens remain structurally valid, while the current role is enforced immediately by the backend filter.

SUPER_ADMIN bootstrap is server configuration only (`SUPER_ADMIN_BOOTSTRAP_EMAIL`). The named account must already exist and may have been created locally or through Google/OIDC. Startup promotes it only when no other SUPER_ADMIN exists; changing the value does not transfer an existing role. The admin role API cannot assign SUPER_ADMIN.

## Avatar images and catalog administration

Public avatar metadata returns `imageUrl` in the form `/api/v1/avatars/{key}/image`. The image endpoint returns the stored JPEG/PNG/WebP bytes with the corresponding `Content-Type`; storage paths are never exposed. `GET /api/v1/admin/avatars`, `POST /api/v1/admin/avatars/upload`, `PUT /api/v1/admin/avatars/{id}` and soft-delete `DELETE` remain restricted to ADMIN or SUPER_ADMIN.

## Personalized conversation creation

`POST /api/v1/conversations` remains compatible with existing clients; `interactionMode` is an optional additive request field and a response field. A successful 201 means the conversation and an initial ASSISTANT message have been saved atomically. Fetch `GET /api/v1/conversations/{id}` to display the generated opening, as dev-auth-ui already does. Creation waits for the configured LLM. A generation failure returns generic 503 and saves neither conversation nor opening; explicit retry is possible. After a lost response, check the conversation list first because POST is not idempotent.

Every persistent turn and opening uses the authenticated profile's preferredName, CEFR and learningGoal plus the actual catalog scenario and assistant identity. Internal behaviorInstructions remain absent from public DTOs. Prior history is limited to the last 10 messages for the provider, preserving USER/ASSISTANT roles in chronological order. See ARCHITECTURE.md for composition, corrections, transaction boundaries and limitations.

## Required scenario and reopening

Persistent conversation creation requires an explicit `scenario`: omitted, null, blank or malformed values return 400 before generation; unknown catalog keys return 404. FREE_TALK is a regular explicit scenario, never a default. The service and Flyway V19 foreign key both enforce a real catalog reference. Conversation response metadata requires the referenced catalog definition and does not substitute a generic identity when it is missing.

GET detail enforces ownership and returns the stored conversation/history without generating a new opening or creating another conversation. Disabled scenarios remain usable for existing history; creation requires an enabled scenario. The dev-auth-ui opens chat only after loading this detail. Existing public DTOs, endpoints and legacy chat compatibility are preserved.

`GET /api/v1/conversation-scenarios` resolves `assistantDisplayName`, `assistantAvatarKey` and `assistantAvatarImageUrl` from the referenced predefined avatar. `GET /api/v1/conversations` and `GET /api/v1/conversations/{id}` return the same resolved identity plus `scenarioDisplayName` and `description`. Clients display these fields directly; they do not join the avatar catalog or hardcode names. `conversation_scenarios.assistantDisplayName` remains an administrative compatibility field and is not the public identity source.

- `POST /api/v1/reading/generate`: autenticado; gera título e texto em inglês e cria uma atividade `IN_PROGRESS`, retornando `activityId`, `title`, texto, dificuldade e tema.
- `POST /api/v1/reading/questions`: com `activityId`, associa e persiste as três questões da atividade (o formato textual legado continua aceito para compatibilidade).
- `POST /api/v1/reading/{activityId}/submit`: autenticado; recebe exatamente três respostas, valida-as contra as questões persistidas e calcula `correctAnswers`, percentual inteiro (`0,33,67,100`) e `SUCCESS` (2–3 acertos) ou `NEEDS_PRACTICE` (0–1). A operação é idempotente.

## Paginação opcional da API v1

Os endpoints abaixo mantêm o formato JSON anterior. Sem parâmetros de paginação, retornam o resultado completo para preservar clientes v1. Quando `page` é informado, ele começa em zero; `size` aceita 1–100. Uma página com menos itens que `size` é a última. `size` sem `page`, números negativos ou tamanhos fora do intervalo retornam 400.

| Endpoint | Parâmetros opt-in | Tamanho padrão | Ordenação estável |
| --- | --- | ---: | --- |
| `GET /api/v1/conversations` | `page`, `size` | 25 | ativas primeiro; atualizadas/encerradas conforme contrato anterior, depois ID |
| `GET /api/v1/conversations/{id}` | `messagesPage`, `messagesSize` | 50 | mensagens por `createdAt ASC, id ASC` |
| `GET /api/v1/reading` | `page`, `size` | 25 | `createdAt DESC, activityId DESC` |
| `GET /api/v1/admin/users` | `search`, `page`, `size` | 25 | `createdAt ASC, id ASC` |

O detalhe de conversa mantém os campos `conversation`, `messages` e `evaluation`; apenas o array `messages` é paginado quando solicitado. Mensagens antigas continuam acessíveis pelas páginas anteriores. A lista de Reading seleciona somente campos do resumo no banco, sem carregar texto ou dicas. A busca administrativa mantém substring sem distinção de maiúsculas/minúsculas em email ou username; filtro e ordenação ocorrem no banco. O painel administrativo usa páginas de 25 usuários.
