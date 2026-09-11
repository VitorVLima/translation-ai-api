# EnglishAI Auth Dev UI

Interface HTML/JavaScript mínima para testar a autenticação local e Google do backend. Não usa npm, React ou `localStorage`. Os tokens ficam apenas no `sessionStorage` desta aba; isso é aceitável somente para desenvolvimento e não deve ser copiado para React Native, que deverá usar armazenamento seguro do dispositivo.

## Configuração e execução

1. Em `app.js`, preencha `GOOGLE_CLIENT_ID` com o mesmo Web Client ID configurado no backend (`GOOGLE_CLIENT_ID`). Não inclua client secret nem segredos do backend.
2. No Google Cloud Console, adicione `http://localhost:5500` como Authorized JavaScript origin.
3. Inicie o backend em `http://localhost:8080`.
4. Nesta pasta, execute `python -m http.server 5500` e abra http://localhost:5500 (não use `file://`).

O backend deve usar `APP_CORS_ALLOWED_ORIGINS=http://localhost:5500`. A UI usa login local, nonce + Google Identity Services, `/users/me`, refresh automático uma vez após 401 e logout por refresh token. O access token do Google nunca é armazenado; somente os tokens próprios do EnglishAI são mantidos temporariamente.
