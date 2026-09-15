# EnglishAI — Guia administrativo

## Primeiro administrador

Defina `ADMIN_BOOTSTRAP_EMAIL` para o email de um usuário já existente e reinicie o Backend. A promoção é explícita por configuração; não há senha hardcoded nem elevação enviada pelo frontend. Remova a variável depois do bootstrap quando apropriado.

## Painel

Sirva `admin-ui/` em um servidor web e use uma sessão autenticada de administrador. O painel mantém tokens em `sessionStorage` usando as chaves `englishai_admin_access_token` e `englishai_admin_refresh_token`; eles são independentes da `dev-auth-ui`. Usuários comuns recebem 403 no Backend mesmo que conheçam as rotas.

## Login

O `admin-ui` aceita login local por email e senha e login Google/OIDC através do mesmo fluxo do produto: `POST /api/v1/auth/google/nonce`, seguido de `POST /api/v1/auth/google` com a credencial retornada pelo Google Identity Services. A role é independente do provedor: contas locais e contas Google podem ser USER ou ADMIN. Depois da autenticação, o painel valida `/api/v1/users/me` e acessa o dashboard administrativo; o Backend continua sendo a autoridade final.

O refresh é automático uma única vez por request, com apenas um refresh concorrente ativo. Logout revoga o refresh conforme o contrato e limpa a sessão administrativa.

## Catálogos

Avatares e cenários podem ser criados, editados e desativados sem recompilar. DELETE é soft-delete (`enabled=false`) para não invalidar perfis ou conversas existentes. `behaviorInstructions` é configuração confiável para o prompt, limitada a 4000 caracteres e nunca aparece na lista pública.

O painel atual oferece dashboard, listagem de avatares e cenários. Uploads de avatar aceitam JPEG, PNG e WebP após validação de MIME, assinatura e tamanho, com armazenamento sem base64.

Usuários não podem enviar avatares. Somente uploads do catálogo administrativo são aceitos; usuários selecionam uma chave de catálogo ativa.

## Hierarquia de roles

As roles são cumulativas: `USER < ADMIN < SUPER_ADMIN`. ADMIN possui todas as capacidades de USER e administra catálogos. SUPER_ADMIN possui as capacidades de USER e ADMIN, além de listar usuários e alterar roles entre USER e ADMIN.

Configure o primeiro superadministrador com `SUPER_ADMIN_BOOTSTRAP_EMAIL=admin@example.com`. A conta precisa existir e autenticar normalmente; o painel nunca cria SUPER_ADMIN nem permite rebaixar ou alterar a própria conta principal. `ADMIN_BOOTSTRAP_EMAIL` continua compatível para promover uma conta a ADMIN quando o bootstrap de SUPER_ADMIN não estiver configurado.

O endpoint de usuários é `GET /api/v1/admin/users` e a alteração é `PATCH /api/v1/admin/users/{id}/role`. Ambas as operações exigem SUPER_ADMIN. O catálogo continua exigindo ADMIN ou SUPER_ADMIN.

## Creating the first SUPER_ADMIN

1. Create and verify the account through the normal local or Google/OIDC flow.
2. Set `SUPER_ADMIN_BOOTSTRAP_EMAIL=admin@example.com` in the local Backend `.env`.
3. Restart the Backend.
4. Authenticate again and confirm `role: SUPER_ADMIN` at `/api/v1/users/me`.

The bootstrap only promotes an existing account. It never creates users, passwords or sessions. At most one `SUPER_ADMIN` is allowed. If another super administrator already exists, the configured candidate is left unchanged and a conflict is logged. Changing the environment email never transfers the role automatically. The admin panel cannot create, demote or modify a `SUPER_ADMIN`.

`ADMIN_BOOTSTRAP_EMAIL` remains a legacy compatibility setting and only promotes an existing account to `ADMIN`. If both settings name the same account, `SUPER_ADMIN` wins.

## Gerenciamento visual de catálogos

O painel exibe miniaturas reais usando `/api/v1/avatars/{key}/image`. Avatares são criados pelo formulário `+ Novo avatar`, que envia `multipart/form-data` para `/api/v1/admin/avatars/upload`; o navegador define o boundary. Edição preserva a key estável e permite substituir a imagem pelo mesmo fluxo de upload. Desativar é soft-delete e pode ser revertido com Ativar.

A tela de Cenários permite criar e editar todos os metadados administrativos, incluindo `behaviorInstructions` e a escolha visual do avatar do assistant a partir do catálogo. Instruções permanecem exclusivas do admin.

## Image replacement

When an administrator replaces an avatar image, the Backend stores the new file first, persists the new asset reference, and then removes the old file when it is not shared by another catalog entry. Cleanup is best effort: a cleanup failure does not invalidate the new image. If persistence fails, the new file is removed as compensation and the previous image remains active.

## Cen?rios personalizados por perfil

Cadastre um ?nico cen?rio por situa??o, sem duplic?-lo por n?vel CEFR. Defina key, displayName, description, assistantDisplayName, avatar, behaviorInstructions, enabled e sortOrder. A key pode ser nova: a composi??o usa o cat?logo real sem exigir altera??o de enum ou recompila??o.

Use behaviorInstructions somente para o personagem e a situa??o. Exemplo de entrevista: `Act as a professional job interviewer. Conduct a realistic interview. Ask one question at a time. React naturally and stay in character.` Para amigos: `Act as a friend. Use casual natural English. Do not turn the conversation into an interview.` N?o inclua nome, idade, n?vel ou objetivo de uma conta nesse campo.

O Backend acrescenta nome preferido, n?vel CEFR e objetivo do usu?rio autenticado, adapta a linguagem mantendo o personagem e gera a primeira mensagem. O nome visual resolvido do avatar participa da identidade no prompt; `assistantDisplayName` permanece como metadado administrativo legado. Instru??es globais priorizam continuidade e corre??es discretas; um cen?rio de ensino pode pedir corre??es expl?citas. O n?vel oficial nunca ? alterado pela conversa.

### Identidade do assistant

O nome visual do personagem vem de `displayName` do avatar selecionado. O formulário mostra `Nome do avatar (key)` no campo Avatar do assistant, mantendo a key técnica para o Backend. A coluna administrativa `Nome do assistant` é mantida por compatibilidade com o contrato antigo; cenários públicos, conversas, cabeçalho do chat e prompts usam o nome atual do avatar. Renomear um avatar atualiza a identidade apresentada também em conversas antigas, sem snapshot.
