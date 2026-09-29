# Requisições autenticadas e refresh

`authenticatedFetch('/api/v1/users/me')` usa a sessão em memória, inclui Bearer
e retorna as respostas HTTP normalmente, exceto 401. Em 401, aguarda a rotação
e repete a operação uma vez. Outro 401 invalida a sessão que enviou o retry;
uma resposta atrasada não invalida um login ou rotação mais recente.

A função aceita apenas caminhos protegidos da API configurada. Login, refresh
e demais `/api/v1/auth/*` usam o serviço direto. Neste incremento, bodies são
strings reutilizáveis (por exemplo, JSON); uploads e streams não são suportados.
Uma futura operação com efeitos deve confirmar que seu 401 ocorre antes dos
efeitos no Backend antes de ser integrada ao retry.

## Contrato verificado no Backend

- `POST /api/v1/auth/refresh`: `{refreshToken}` → `{accessToken, refreshToken}`.
- O refresh antigo é substituído na mesma família. Reutilização revoga a família.
- Refresh inválido, expirado, revogado ou reutilizado: 401, sem distinção pública.
- `GET /api/v1/users/me`: Bearer obrigatório, retorna `UserResponse`.
- 401 também pode significar JWT malformado ou usuário inexistente, não só expiração.
- 403 não dispara refresh. Pode indicar falta de permissão (admin) ou e-mail não
  verificado (login). 429 inclui `Retry-After`; não há retry automático de 429.
- Logout revoga a família do refresh; não foi adicionada chamada nem UI de logout.

## Operação compartilhada

`auth.session.ts` mantém uma única `refreshPromise`, usada pelo startup e por
requisições protegidas. A ordem é ler SecureStore, fazer um POST, salvar o novo
refresh token e só então atualizar access token e revisão em memória.
`UserResponse` não é alterado no refresh automático. No startup, `/users/me`
é consultado diretamente depois da persistência, sem outro refresh em caso de 401.

A revisão numérica evita outra rotação quando um 401 antigo chega depois da
primeira rotação. Comparar apenas o access token seria insuficiente: o gerador
JWT atual pode emitir valores iguais para o mesmo usuário no mesmo segundo.

Em sucesso, a Promise é liberada para a próxima expiração. Em falha, ela permanece
rejeitada até um novo login bem-sucedido ou reinício completo do runtime. Assim,
requests concorrentes ou posteriores não disparam uma sequência de refreshes.

| Falha | Estado local |
|---|---|
| Refresh 401 ou ausência de refresh local | Limpa memória e tenta remover SecureStore |
| Rede, inclusive perda do body da resposta | Preserva credencial; propaga `SessionError('network')` |
| Refresh 429 | Preserva credencial; propaga `rateLimit`; aguardar antes de nova inicialização |
| Refresh 5xx/outro status inesperado | Preserva credencial; propaga `unavailable` |
| SecureStore falha na leitura | Propaga `storage`, sem assumir credencial inválida |
| SecureStore falha após rotação | Limpa memória, tenta remover token local, sem retry |
| Refresh 200 com JSON/contrato inválido | Não utiliza possível token antigo; invalida localmente |
| Retry protegido retorna 401 | Encerra operação e invalida a sessão/revisão correspondente |

Se a remoção segura também falhar, a memória continua vazia; não é possível
garantir a exclusão física enquanto o armazenamento do dispositivo estiver indisponível.
`App.tsx` assina a notificação de invalidação e volta ao Login com mensagem segura.

## Ambiguidade de rede

Se o Backend rotacionar R1 para R2 e a resposta se perder, o cliente não consegue
saber se R1 ainda vale. Ele preserva o token salvo, não considera a credencial
comprovadamente inválida e bloqueia novas tentativas automáticas no runtime atual.
Não há retry, timer, polling ou fila de requests de refresh.

Ao reabrir completamente o app, a restauração já existente tenta uma vez com o
token salvo. Se ele tiver sido consumido, o Backend responde 401 e exige novo
login; essa reabertura não garante recuperação. Um novo login evita reutilizar
a credencial ambígua. Recuperação transparente desse caso exigiria outro contrato
do Backend; nenhuma mudança desse tipo foi feita.

## Verificação

Teste automatizado, sem instalar pacotes, dentro de `mobile/`:

```powershell
node --test tests/authenticated-fetch.test.cjs
```

Os testes usam módulos reais compilados em memória com o TypeScript existente,
fetch simulado e SecureStore simulado. Não acessam o Backend, credenciais reais
ou armazenamento nativo. Cobrem concorrência, resposta atrasada, JWT idêntico,
persistência antes do retry, falhas, startup e ausência de loops.

No Android físico, o botão **Verificar sessão**, disponível apenas com `__DEV__`,
envia duas chamadas simultâneas a `/users/me` e mostra somente feedback genérico.

1. Fazer login e tocar no botão: esperar dois GET 200 e nenhum POST de refresh.
2. Manter o app aberto até expirar o access token. O padrão documentado é 900 s;
   verificar o TTL configurado localmente, sem ler ou imprimir o token.
3. Tocar no botão: esperar dois GET 401, um POST refresh 200 e dois GET 200.
   Cada GET original tem no máximo um retry. Não reabrir o app antes desse teste,
   pois o startup renovaria o access token.
4. Repetir após outra expiração: comprova o uso do refresh token rotacionado.
5. Em conta/ambiente descartável com família previamente revogada ou expirada,
   esperar a expiração do access token e tocar no botão: refresh 401 e Login.
6. Desligar o Backend: o erro de rede não deve apagar a sessão. Para simular perda
   especificamente durante o refresh, usar os testes automatizados ou falha de
   rede controlada; não registrar bodies/headers para inspecionar tokens.
7. Conferir 429, falha de persistência e segundo 401 com os testes simulados.
   Não alterar configurações de segurança do Backend para forçar esses casos.

Contar apenas método, caminho e status no acesso HTTP do Backend (ou usar
breakpoints nos controllers). Não habilitar captura de Authorization, request
body, response body ou valores dos tokens. Os testes não substituem a validação
do SecureStore e do comportamento visual em Android real.
