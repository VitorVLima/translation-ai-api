# EnglishAI — Interface web

Interface de aprendizado de idiomas em HTML, CSS e JavaScript, sem framework, bundler ou dependências visuais externas. Conversação, tradução e correção usam as integrações existentes do EnglishAI.

## Executar localmente

1. Inicie o PostgreSQL e o Spring Boot em `http://localhost:8080`.
2. A origem `http://localhost:5500` deve estar permitida na configuração CORS existente.
3. Inicie o provider de IA configurado no backend. Para voz, mantenha os serviços locais Whisper e Piper disponíveis.
4. Na pasta `dev-auth-ui`, execute:

```bash
python -m http.server 5500
```

5. Abra `http://localhost:5500` e entre com login local ou Google.

## Funcionalidades existentes

- **Início:** atalhos para conversar, traduzir e corrigir.
- **Conversar:** persistent chat via `POST /api/v1/conversations/{id}/messages/stream`, opened only after loading a scenario-linked conversation and its Backend history.
- **Texto (padrão):** o microfone envia áudio a `POST /api/v1/transcriptions`; a transcrição preenche o campo para revisão. Envio e reprodução são manuais.
- **Voz:** gravação explícita → STT completo → chat SSE → reply completa → `POST /api/v1/speech` → reprodução automática. O idioma selecionado (`en` ou `pt`) é mantido durante o turno. Não há escuta contínua nem nova gravação automática.
- **Traduzir:** português ↔ inglês, inversão dos idiomas, limite de 5.000 caracteres e resultado em painel separado.
- **Corrigir:** revisão em português ou inglês e explicação opcional via `POST /api/v1/correct/explain`.
- **Conta:** nome de usuário, e-mail, confirmação do e-mail e logout.

A autenticação disponível nesta interface é login local e Google. Cadastro, confirmação por link e recuperação/redefinição de senha não estão implementados aqui. O perfil apenas exibe o estado de confirmação retornado pela API.

## Interface e acessibilidade

O CSS está organizado em 16 seções, com tokens de cor, espaçamento, bordas e sombras. A tipografia usa fontes do sistema. Ícones são SVG inline ou máscaras SVG locais; não há biblioteca externa de ícones.

A navegação lateral vira uma barra inferior compacta em telas menores. O modo Texto/Voz usa botões com `aria-pressed`, mantendo o seletor interno existente. Estados de resposta, gravação e processamento têm texto visível; botões têm foco visível e feedback de carregamento. Animações respeitam `prefers-reduced-motion`.

## Codificação

Todos os arquivos são salvos em **UTF-8**. O HTML declara `<meta charset="UTF-8">`. Salve edições nesse encoding, evitando conversões por ANSI/Windows-1252 ou pipelines de terminal que substituam acentos por `?`.

A auditoria encontrou sequências de ícones previamente interpretadas em um encoding incorreto e texto do README já salvo com substituições por interrogações. A correção foi feita no conteúdo dos arquivos, sem mascarar texto com CSS.

## Privacidade e comportamento

Tokens permanecem somente no `sessionStorage` da aba. Requisições autenticadas mantêm a tentativa única de refresh e repetição após 401. O Google usa nonce novo a cada preparação.

Conversation history is persisted in the Backend; the UI renders GET detail and does not send client history as the source of truth. Audio stays transient and no conversation content or tokens are logged.

A reprodução é única. Limpar, sair da tela, mudar de modo, fazer logout ou descarregar a página cancela o pipeline e limpa os recursos. Iniciar uma gravação para a reprodução anterior. Falhas de TTS preservam a reply textual.

Métricas de STT, primeiro token, chat total e TTS continuam separadas.

## Validar

```bash
node --check dev-auth-ui/app.js
```

Revise login/Google/logout/refresh, tradução nos dois sentidos, correção/explicação, chat SSE/multi-turn, Ouvir/Parar, STT manual e modo Voz. Confira também estados vazios, erros, cancelamentos, teclado, movimento reduzido e layouts de 375 a 1920 px. Testes com serviços simulados não substituem a validação real do microfone, reprodução e autenticação.

## Scenario-required conversation flow

- Home: Comecar uma conversa opens Scenarios, without creating anything.
- Conversar: without a loaded conversation, redirects to Scenarios.
- Scenarios: explicit selection -> POST creation/opening -> GET detail -> Chat.
- Conversations: GET existing detail -> original scenario/history -> Chat, without POST.
- Nova conversa: clears temporary selection and opens Scenarios; does not delete stored history.
- Leaving chat or logging out clears currentConversation and cancels pending UI work. Late responses cannot reopen it.
- F5/authenticated startup: Scenarios. This SPA has no conversation URL or stored selection; reopen through Conversations.
- FREE_TALK is available only when explicitly selected.

`appState.currentConversation` holds the validated Backend response. The chat language follows that response. The scenario catalog defines the assistant name/avatar; names such as Layla or Rodrigo are not hardcoded. Legacy standalone chat is no longer selected by this UI.

Automated navigation checks (full script with fake DOM and HTTP):

```bash
node --check dev-auth-ui/app.js
node --test dev-auth-ui/navigation.test.cjs
```

These checks cover real app handlers and state transitions; they do not replace live browser, audio or real-model validation. If creation succeeds but detail retrieval fails, reopen through Conversations rather than creating repeatedly. POST still has no idempotency key.
