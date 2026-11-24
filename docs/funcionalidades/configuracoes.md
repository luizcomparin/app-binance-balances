---
titulo: Configurações (chaves da Binance e da Coinalyze)
resumo: Modal da engrenagem para informar/trocar a chave da Binance (obrigatória para dados da conta) e a da Coinalyze (opcional, liquidações reais); o server testa, passa a usar na hora e grava no .env.
arquivos: [server/services/apiKeySettings.js, server/services/coinalyzeKeySettings.js, server/config.js, server/routes.js, public/components/settings/SettingsModal.js, public/components/settings/SettingsModal.html, public/components/settings/SettingsModal.css, public/api/binance.js]
rotas: [GET /settings/api-key, POST /settings/api-key, GET /settings/coinalyze-key, POST /settings/coinalyze-key]
eventos: [COINALYZE_KEY_CHANGED]
storage: []
---

# Configurações

## O que faz

O modal **Configurações** (⚙ no topo, `#settings-btn`) tem duas seções.

**API da Binance**
- Status: "Chave configurada (termina em …abcd)" ou "Nenhuma chave".
- Campos API Key e Secret Key (com Mostrar/Ocultar) e o botão "Testar e salvar".
- Ao salvar com sucesso, a página recarrega depois de 1,5 s, ou de 6 s se houver aviso de permissão.
- Um tutorial (`<details>`) explica como criar uma chave só de leitura.
- **Sem chave configurada, o modal abre sozinho no boot** e a carteira não é carregada.

**API da Coinalyze (opcional)**
- Status, campo e botões "Testar e salvar" e "Remover chave", com tutorial.
- Também é aberta pelo gráfico de preço ao ligar "Liquidações" sem chave (`openSettings("coinalyze")`).

O modal fecha pelo ×, por clique fora ou por Esc. Ao fechar, o campo do secret é limpo.

## Página

- `SettingsModal.js`:
  - `initSettings()`, chamada em `index.js`, liga os eventos, busca os dois status e **devolve se há chave da Binance**. Sem chave, chama `openSettings()`.
  - `openSettings(section)`: com `section === "coinalyze"`, rola até a seção da Coinalyze e abre o tutorial se ainda não houver chave.
  - `onSubmit` → `saveApiKey(apiKey, apiSecret)` → `renderStatus` + mensagem (com os `warnings`) → `location.reload()`.
  - `submitCoinalyze(apiKey)` → `saveCoinalyzeKey(apiKey)` (vazio = remover) → `emit(COINALYZE_KEY_CHANGED)`. O gráfico de preço então recarrega o painel e a camada de liquidações reais e o mapa de liquidação (que passa a ser, ou deixa de ser, ajustado pelas liquidações reais).
- Ids: `#settings-modal`, `#settings-close`, `#settings-status`, `#settings-form`, `#settings-api-key`, `#settings-api-secret`, `#settings-secret-toggle`, `#settings-message`, `#settings-save`, `#settings-tutorial`, `#settings-coinalyze`, `#settings-coinalyze-status`, `#settings-coinalyze-form`, `#settings-coinalyze-key`, `#settings-coinalyze-message`, `#settings-coinalyze-save`, `#settings-coinalyze-remove`, `#settings-coinalyze-tutorial`.

## Server

- `GET /settings/api-key` → `apiKeyStatus()` → `{ configured, keyHint }`.
- `POST /settings/api-key` (`sameOriginJson` + `express.json({ limit: "2kb" })`) → `changeApiKey(body)`:
  1. Valida o formato com `CREDENTIAL_PATTERN`.
  2. `signedGetWith(creds, "/api/v3/account", { omitZeroBalances: true })`. Em erro, devolve 400 com mensagem amigável (`-2015`, `-2014`, `-1022` → chave, permissão ou IP).
  3. `/sapi/v1/account/apiRestrictions` → `warnings` se a chave puder sacar ou negociar. Se o endpoint falhar, segue sem aviso.
  4. `setCredentials`, `clearCache()` e `clearTradesCache()`.
  5. Devolve `{ status, warnings, persist }`. A rota chama `persist()` (grava no `.env`) em `res.on("finish")`.
- `GET|POST /settings/coinalyze-key` → `coinalyzeKeySettings.js` com o mesmo fluxo: testa com `GET /exchanges`, `setCoinalyzeKey`, `clearCache()` e grava depois de responder. A chave vazia remove.

Detalhes de segurança em [configuracao-e-seguranca](../referencia/configuracao-e-seguranca.md).

## Casos de borda

- Em `npm run dev`, gravar o `.env` reinicia o server (nodemon). A página recarrega e o `apiFetch` espera o server voltar (até 15 s).
- `setMessage` usa `innerHTML` (para quebrar linha nos avisos). Por isso as mensagens e os avisos vindos do server passam por `escapeHtml` antes.
- A chave da Coinalyze não está em `.env.example`.

## Checklist ao alterar

- Nova chave ou config: padrão de formato em `config.js`, `get/set/saveXToEnv`, serviço `xKeySettings.js`, as duas rotas com `sameOriginJson`, as funções em `api/binance.js`, a seção no `SettingsModal.html`/`.js` e a linha em [configuracao-e-seguranca](../referencia/configuracao-e-seguranca.md).

## Como verificar

1. Abra a ⚙.
2. Informe uma chave inválida: deve aparecer o erro amigável.
3. Informe uma chave válida: aparece "Chave salva", a página recarrega e o `.env` fica atualizado. **Não exiba o conteúdo do `.env`.**
4. Coinalyze: salve e remova a chave, e confira que o painel Liquidações do gráfico reage.
