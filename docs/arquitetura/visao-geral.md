---
titulo: Visão geral da arquitetura
resumo: Stack, boot do server e da página, caminho de uma requisição e contrato de erro.
arquivos: [server.js, public/index.html, public/index.js, package.json, .env.example, .gitignore]
rotas: [GET /site, GET /site/:page]
eventos: []
storage: []
---

# Visão geral

## Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Server | Node ≥ 20.12 (ES modules, `"type": "module"`), Express 5, `cors`, `node-fetch` | Lê o `.env` com `process.loadEnvFile()`. |
| Dev | `nodemon` (reinicia o server), `livereload` + `connect-livereload` (recarrega a página) | O livereload só liga em `npm run dev` (flag `--livereload` no script). São dependências de dev, importadas dinamicamente. |
| Página | HTML/CSS/JS puro em ES modules, **sem build e sem framework** | Servida pelo próprio Express. |
| Gráficos | Chart.js 4.4.1 (aba Distribuição) e TradingView Lightweight Charts 5.0.8 (gráfico de preço) | Vêm de CDN (jsDelivr), carregados em `public/index.html` e usados como globais `Chart` e `window.LightweightCharts`. |
| Dados | API spot da Binance (assinada), Binance Futures `fapi` (pública), Coinalyze (opcional) | Ver [integracoes-externas](../referencia/integracoes-externas.md). |

Não há banco de dados, lint nem build. Os testes automatizados (`npm test`) cobrem só as funções puras; a interface é verificada à mão (ver [convencoes](convencoes.md#testes)). Todo o estado do server fica **em memória** (caches) e se perde ao reiniciar. O único arquivo que o server grava é o `.env`, quando a pessoa troca as chaves pelo dashboard.

## Boot do server (`server.js`)

1. `import { PORT } from "./server/config.js"` vem **primeiro**: carrega o `.env`, valida `PORT` (encerra o processo se for inválida) e avisa quando faltam as chaves da Binance.
2. CORS restrito a `http://localhost:<PORT>` e `http://127.0.0.1:<PORT>`. Requisições sem `Origin` (curl, mesma origem) passam.
3. Só com `--livereload` (`npm run dev`): o livereload observa `public/` (porta 35729, em `localhost`) e injeta o script no HTML.
4. Arquivos estáticos: `public/` é servido em `/` e também em `/site`.
5. `GET /site` e `GET /site/:page` (slug `[a-z0-9-]+`) devolvem `index.html`; o front abre a aba do slug (ver [abas-e-navegacao](../funcionalidades/abas-e-navegacao.md)).
6. `registerRoutes(app)` registra a API JSON (ver [api](../referencia/api.md)).
7. `app.listen(PORT, "127.0.0.1")` e `app.listen(PORT, "::1")`: o server escuta **só no próprio computador**. Os dois endereços existem porque `localhost` pode resolver para IPv4 ou IPv6; sem IPv6, segue só no IPv4. Ao subir, imprime a URL do dashboard e a lista de rotas. **Atualize essa lista ao criar uma rota.**

Ao importar `server/binance/client.js`, o relógio é sincronizado com a Binance (`/api/v3/time`) e um `setInterval` repete a sincronização a cada 30 min.

## Boot da página (`public/index.js`)

1. `showLoading()` mostra o overlay "Carregando dados...".
2. `initAppShell()` busca e injeta recursivamente todos os `data-component` do HTML. Ver [frontend](frontend.md).
3. Algumas funções vão para `window.*` porque o HTML as chama via `onclick`: `loadOrders`, `applyOrderFilters`, `sortOrders`, `loadBalances`, `sortBalances`, `openSimulationDialog`, `closeSimulationDialog`, `loadExecutedOrders`, `applyExecutedFilters`, `sortExecutedOrders` e `openPriceChart`.
4. `init*()` de cada componente, para que passem a escutar os eventos antes da primeira carga.
5. `initTabs()` por último, para que a aba indicada na URL já encontre todos ouvindo `TAB_CHANGED`.
6. `initSettings()` consulta `/settings/api-key`. **Sem chave**, abre o modal de Configurações e **não** carrega a carteira.
7. Com chave: `loadBalances()` (que dispara `loadPositions()` em paralelo) e `loadOrders()`, e depois `hideLoading()`.

Algumas abas só carregam os dados quando abertas: Ordens Executadas e o próprio gráfico de preço (que espera os saldos para escolher a moeda inicial).

## Caminho de uma requisição

```
componente (public/components/...)
  └─ public/api/binance.js        apiFetch(): tenta de novo por 15 s se o server estiver reiniciando
       └─ HTTP GET /rota
            └─ server/routes.js   valida a entrada (ex.: :asset ^[A-Z0-9]{1,20}$) → handle(fn)
                 └─ server/services/x.js      regra de negócio, geralmente com cached(key, ttl, fn)
                      └─ server/binance/*.js | server/coinalyze/client.js   chamadas externas
```

## Contrato de erro

- As rotas registradas com `handle(fn)` respondem com o JSON retornado. Em caso de erro, respondem `500 { error: e.toString(), code }`. Sem chave da Binance, a resposta é **`401 { code: "API_KEY_MISSING" }`**. `e.toString()` inclui o prefixo `"Error: "` e, nos erros da Binance, o corpo cru da resposta.
- Rotas de validação respondem `400 { error: "Moeda inválida" }` ou `"Intervalo inválido"`, ou outra mensagem do tipo.
- As rotas `POST /settings/*` respondem `400 { error: <mensagem amigável> }` ou `403` quando a origem ou o content-type não passam.
- Alguns serviços **não** lançam erro e respondem `200` com `{ available: false, reason }`: `liquidationMap`, `futuresData` e `liquidations`. O front trata o `reason` (ver cada doc).
- Os serviços que percorrem vários pares (`positions`, `executedOrders`, `orderHistory`, `assetTrades`) devolvem `errors: [{ symbol, error }]` com as falhas parciais e só abortam tudo em 429/418.
- No front, `getJson()` (em `api/binance.js`) lança `Error(json.error)` quando `!res.ok` ou quando há `json.error`. Algumas funções antigas não usam `getJson` (ver débitos).
