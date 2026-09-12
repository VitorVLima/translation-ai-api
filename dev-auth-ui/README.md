# EnglishAI Development UI

Interface provisória, sem React, npm ou bundler, para testar as funcionalidades atuais do EnglishAI. Os tokens próprios ficam somente no `sessionStorage` desta aba. Não armazene essa solução em produção.

## Como iniciar

1. Inicie o PostgreSQL e o backend Spring Boot em `http://localhost:8080`.
2. Configure `APP_CORS_ALLOWED_ORIGINS=http://localhost:5500` no backend.
3. Se `LLM_PROVIDER=ollama`, inicie o Ollama e confirme o modelo em `OLLAMA_MODEL` (por exemplo, `qwen2.5:3b`). Para Gemini, configure apenas as variáveis do backend.
4. Nesta pasta, execute:

```bash
python -m http.server 5500
```

5. Abra `http://localhost:5500`.
6. Entre com login local ou Google.

## Funcionalidades

- **Início**: dados da conta e atalhos.
- **Traduzir**: pt ↔ en, contador de 5.000 caracteres, inversão de idiomas e tempo da operação.
- **Corrigir**: correção em pt/en e botão opcional para explicar a correção.
- **Conversar**: prática textual em pt/en via `POST /api/v1/chat/stream` (SSE), com resposta progressiva do tutor, correção opcional ao final, ações para explicar a correção e traduzir a resposta, estados de carregamento e latência até o primeiro token/total.
- **Conta**: username, email, status de verificação e logout.

Todas as operações de IA chamam somente o backend e usam Bearer access token. Em caso de 401, o refresh é tentado uma única vez e a requisição é repetida uma única vez. Respostas 400, 429 e 503 recebem mensagens amigáveis; textos, prompts, respostas e tokens não são registrados no console nem persistidos.

A conversa não é persistida no backend: as mensagens exibidas são um histórico visual em memória da página. As últimas 10 mensagens user/assistant são enviadas como contexto curto em cada nova chamada, sem salvar em `localStorage`/`sessionStorage`; cards de correção, explicação e tradução não entram no contexto. Recarregar a página limpa esse histórico.

Na conversa, **Explicar** chama `POST /api/v1/correct/explain` somente após o clique e **Traduzir** chama `POST /api/v1/translate` para a resposta do tutor. O provider ativo continua sendo controlado pelo backend. O endpoint rejeita mais de 10 mensagens de histórico; a UI envia somente as 10 mais recentes.

A UI não implementa cadastro, verificação de email ou recuperação de senha. O botão Google obtém um nonce novo a cada preparação/tentativa.

