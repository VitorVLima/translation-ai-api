# Limite de conversas e voz por cenário — 15/09/2026

## Arquitetura e comportamento

Antes, a criação validava o cenário, gerava a abertura fora de transação e gravava conversa + mensagem em uma transação curta, sem limite. Agora verifica a quantidade antes da LLM e repete a verificação na gravação, com bloqueio pessimista da linha do usuário e isolamento READ COMMITTED. A quarta criação retorna HTTP 409 no formato existente `{"message":"You can have at most 3 conversations."}`. A exclusão libera a vaga. O limite vale para todas as roles.

O bloqueio é do PostgreSQL e funciona entre instâncias do Backend. A geração permanece fora da transação. Duas solicitações que encontrem duas conversas podem gerar duas aberturas; somente uma é admitida na gravação. Assim, evita-se manter conexão/bloqueio durante a LLM sem introduzir reservas duráveis. Usuários que já tenham mais de três conversas não perdem dados: novas criações ficam bloqueadas até a contagem ser inferior a três. Escritas SQL externas não passam por essa regra da aplicação.

Antes, `TextToSpeechProvider` recebia texto/idioma e Piper escolhia o modelo padrão do idioma. Agora `SpeechSettings` acrescenta voz opcional e velocidade sem conceitos específicos de Piper. O cenário persiste `ttsVoice` e `speechRate`; não há snapshot na conversa nem configuração no avatar. `AssistantIdentityResolver` continua resolvendo a identidade pública.

`POST /api/v1/speech` aceita `conversationId` opcional. Com id, `ConversationSpeech` valida ownership, resolve idioma persistido e configuração atual do cenário. Alterações administrativas passam a valer nas conversas antigas no próximo TTS. Sem id, Tradução/Correção mantêm o caminho genérico. O renderer compartilhado das ações ASSISTANT envia esse id tanto no histórico como nas respostas novas.

O novo `GET /api/v1/admin/tts/voices`, protegido por ADMIN/SUPER_ADMIN, consulta `TextToSpeechProvider.voices()` e o `/voices` privado do Piper. O catálogo vem dos modelos configurados e arquivos de voz instalados ao lado deles, com `.onnx.json` correspondente; só retorna chave, nome e idioma. As vozes reais encontradas foram Lessac High (EN) e Faber Medium (PT). Não há download, chave privada no frontend ou acesso direto do navegador ao Piper.

Piper recebe `voice` e `speechRate` e converte velocidade em duração: escala atual do idioma dividida pela velocidade. `1.00x` preserva a configuração atual (inglês em escala 1.2, português em 1.0). A faixa 0.75–1.25 é validada no formulário, Backend, banco e serviço Piper. Voz de outro idioma usa a voz padrão do idioma solicitado; uma voz removida retorna erro TTS genérico.

## Migration e interfaces

`V20__scenario_speech_settings.sql` adiciona `tts_voice VARCHAR(128)` nullable e `speech_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0`, com constraints. Null preserva o padrão do provider por idioma. Migrations antigas e `ddl-auto=validate` foram preservados.

O Admin carrega voz/velocidade salvas, mostra o multiplicador atual e envia ambos junto aos campos existentes. Campos omitidos por clientes antigos preservam valores; voz vazia explicitamente restaura o padrão. Desativar/ativar cenário também preserva voz/velocidade. Catálogo indisponível não apaga a seleção salva.

Em Cenários, a UI consulta a lista do usuário, bloqueia criação com três ou mais, explica o limite e reflete exclusão sem novo login. Também trata 409 retornado pelo Backend quando a contagem local estava desatualizada.

## Arquivos alterados nesta implementação

Prefixo Java de produção: `Backend/src/main/java/com/example/com/englishai/backend/`.

- `application/admin/CatalogService.java`
- `application/conversation/ConversationService.java`
- `application/conversation/ConversationLimitReachedException.java` (novo)
- `application/ports/TextToSpeechProvider.java`
- `application/tts/SynthesizeSpeech.java`
- `application/tts/TextToSpeechRequest.java`
- `application/tts/ConversationSpeech.java` (novo)
- `application/tts/SpeechSettings.java` (novo)
- `application/tts/TtsVoice.java` (novo)
- `infrastructure/persistence/entity/ConversationScenarioDefinitionEntity.java`
- `infrastructure/persistence/repository/ConversationJpaRepository.java`
- `infrastructure/persistence/repository/UserJpaRepository.java`
- `infrastructure/tts/PiperTextToSpeechProvider.java`
- `presentation/rest/admin/AdminCatalogController.java`
- `presentation/rest/admin/AdminTtsController.java` (novo)
- `presentation/rest/exception/GlobalExceptionHandler.java`
- `presentation/rest/tts/TextToSpeechController.java`

Prefixo Java de testes: `Backend/src/test/java/com/example/com/englishai/backend/`.

- `application/admin/CatalogServicePublicAvatarTest.java`
- `application/admin/ScenarioSpeechSettingsTest.java` (novo)
- `application/conversation/ConversationServiceTest.java`
- `application/tts/ConversationSpeechTest.java` (novo)
- `infrastructure/tts/PiperTextToSpeechProviderTest.java` (novo)
- `integration/conversation/ConversationLimitIntegrationTest.java` (novo)
- `integration/conversation/ConversationScenarioReferenceIntegrationTest.java`
- `presentation/rest/conversation/ConversationControllerTest.java`
- `presentation/rest/tts/SpeechApiTest.java` (novo)

Demais arquivos:

- `Backend/src/main/resources/db/migration/V20__scenario_speech_settings.sql` (novo)
- `dev-auth-ui/app.js`, `dev-auth-ui/navigation.test.cjs`
- `admin-ui/app.js`, `admin-ui/scenarios.test.cjs` (novo)
- `piper-service/main.py`, `piper-service/test_main.py`, `piper-service/README.md`
- `ARCHITECTURE.md`, `API_V1_CONTRACT.md`, `ADMIN_GUIDE.md`, este relatório

Alterações já presentes em `Backend/compose.yaml`, HTML/CSS do frontend e arquivos locais foram preservadas.

## Testes e resultados reais

| Validação | Resultado |
| --- | --- |
| `mvn test` em `Backend` | BUILD SUCCESS; 371 testes, 0 falhas, 0 erros, 0 ignorados |
| `node --check dev-auth-ui/app.js` | Sucesso |
| `node --check admin-ui/app.js` | Sucesso |
| `node --test dev-auth-ui/navigation.test.cjs admin-ui/scenarios.test.cjs` | 43 testes aprovados: 38 usuário + 5 Admin |
| pytest `piper-service/test_main.py` | 44 aprovados; 8 avisos de depreciação das dependências/APIs existentes |
| Piper instalado, frases sintéticas EN/PT | Modelos reais produziram WAV válido com 1.15x e 0.85x, respectivamente |
| `git diff --check` | Sucesso |

Cobertura nova: contagens 0/2/3 por usuário; exclusão; recusa antes da LLM; corrida real com duas threads e PostgreSQL disputando a última vaga; persistência da voz/velocidade; validações; HTTP 409; ownership do TTS; roles administrativas; atualização de cenário refletida no TTS; compatibilidade genérica; payload do adapter Piper; seleção segura de modelos; inversão da velocidade; formulários Admin e preservação de avatar/instruções; botões e mensagem de limite; exclusão e conflito com contagem local antiga.

Uma primeira execução Maven detectou um fixture HTTP incompleto (campos primitivos omitidos); o fixture foi corrigido e a suíte completa passou. Node e pytest precisaram executar fora do isolamento porque o ambiente bloqueou processo-filho/pasta temporária. Não houve dependência de microfone físico.

## Limitações e ativação

- Não foi feita inspeção visual/interação manual das páginas no navegador, nem teste ponta a ponta com LLM real. Os testes de UI usam DOM/HTTP simulados; o Piper teve também teste real de síntese.
- Pode haver geração concorrente excedente antes da admissão final, conforme descrito acima; não pode haver quarta persistência pelo serviço.
- Já existirem mais de três conversas não provoca exclusão automática.
- Atualmente há uma voz instalada por idioma. Novas opções dependem da instalação de modelos compatíveis pelo operador.
- Reiniciar Piper e Backend e atualizar as páginas web ativa as mudanças. Flyway V20 foi validado pela suíte com PostgreSQL; `.env` e modelos não foram alterados.
