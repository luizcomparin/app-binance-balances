---
titulo: Arquitetura do server
resumo: Camadas config → clientes externos → cache → serviços → rotas, e a responsabilidade de cada arquivo.
arquivos: [server.js, server/config.js, server/routes.js, server/lib/cache.js, server/lib/rateLimit.js, server/binance/client.js, server/binance/account.js, server/binance/market.js, server/binance/futures.js, server/coinalyze/client.js]
rotas: []
eventos: []
storage: []
---

# Server

## Camadas

Cada camada só importa as que estão abaixo dela.

```
routes.js            HTTP: valida a entrada, chama 1 serviço e formata o erro (handle, sameOriginJson)
services/*.js        regra de negócio; um arquivo por funcionalidade/rota
lib/cache.js         cached(), mapLimit(), clearCache()
lib/rateLimit.js     limitador de requisições da fapi e da Coinalyze
binance/*.js         clientes da Binance (spot assinado/público, futures público)
coinalyze/client.js  cliente da Coinalyze
config.js            .env, chaves em memória, gravação no .env, constantes (BASE_URL, DAY_MS)
```

## Arquivo por arquivo

| Arquivo | Responsabilidade | Exporta (principal) |
|---|---|---|
| `config.js` | `process.loadEnvFile()`; valida `PORT`; guarda as chaves **em memória** (trocáveis sem reiniciar); grava linhas `NOME=valor` no `.env` preservando o resto | `PORT`, `getApiKey/getApiSecret/hasCredentials`, `setCredentials`, `saveCredentialsToEnv`, `getCoinalyzeKey/setCoinalyzeKey/saveCoinalyzeKeyToEnv`, `CREDENTIAL_PATTERN`, `COINALYZE_KEY_PATTERN`, `BASE_URL`, `DAY_MS` |
| `routes.js` | Todas as rotas. `handle(fn)` envolve o handler. `sameOriginJson` protege os POST de configurações | `registerRoutes(app)` |
| `lib/cache.js` | `cached(key, ttlMs, fn)`: memoiza **a promise** (chamadas simultâneas compartilham a mesma), o resultado vale `ttlMs` e erros não ficam em cache. `mapLimit(items, limit, fn)` limita a concorrência. `clearCache()` limpa tudo (troca de chave) | `cached`, `mapLimit`, `clearCache`, `SHORT_CACHE_MS` (15 s) |
| `binance/client.js` | `publicGet` e `signedGet`/`signedGetWith` (HMAC-SHA256, `recvWindow` de 10 s, timestamp corrigido pelo offset do relógio). Controle de peso (`X-MBX-USED-WEIGHT-1M`, pausa perto de 5000/6000). Em 429/418 respeita o `Retry-After` e tenta 1 vez. Em `-1021` ressincroniza e tenta 1 vez. `MissingCredentialsError` (code `API_KEY_MISSING`) | `publicGet`, `signedGet`, `signedGetWith`, `MissingCredentialsError` |
| `binance/account.js` | Endpoints assinados: `/api/v3/account` (15 s), `/api/v3/openOrders` (15 s), `/api/v3/allOrders` por símbolo (60 s). `myTrades` com **cache incremental por símbolo** (ver abaixo) | `getRawBinanceAccount`, `getAccountBalances`, `getOpenOrders`, `getAllOrders`, `getAllMyTrades`, `clearTradesCache` |
| `binance/market.js` | Cotações (`ticker/price`, 15 s), ticker 24h MINI (15 s), `exchangeInfo` (6 h). `getPriceInUSDT(asset, prices)` converte para USDT. `resolveSymbol` separa base/quote | `getAllPrices`, `getTickers24h`, `getSymbolInfo`, `getPriceInUSDT`, `resolveSymbol` |
| `lib/rateLimit.js` | `createRateLimiter({ name, maxRequests, windowMs, weightHeader, maxWeight, maxWaitMs })`: teto por janela, teto de peso informado pela API e pausa em 429/418 pelo `Retry-After`. Esperas acima de `maxWaitMs` (15 s) lançam `RateLimitError` (status 429) na hora. `limitedFetch(limiters, url, options)` passa por todos os limitadores e tenta de novo uma vez depois de um 429/418 | `createRateLimiter`, `limitedFetch`, `RateLimitError` |
| `binance/futures.js` | `fapiGet` (público, via `lib/rateLimit.js`: peso de até 2000/2400 por minuto e, em `/futures/data/*`, até 900/1000 requisições a cada 5 min). Mapa de perpétuos USDT (6 h). `getPerpetualFor(asset)` resolve prefixos de lote (`1000PEPE`…). `futuresDataSeries` pagina `/futures/data/*` para trás (500 por página, 30 dias no máximo) | `fapiGet`, `getPerpetualFor`, `futuresDataSeries` |
| `coinalyze/client.js` | `coinalyzeGet(path, params, key)` com header `api_key`, via `lib/rateLimit.js` (um limitador por chave, com até 38 de 40 requisições por minuto). Erros com `code` `COINALYZE_KEY_MISSING`, `COINALYZE_KEY_INVALID` (401), `COINALYZE_RATE_LIMIT` (429) ou `COINALYZE_ERROR` | `coinalyzeGet` |

### Serviços

| Serviço | Rota(s) | Doc |
|---|---|---|
| `wallet.js` | `/balances` | [carteira-e-cards](../funcionalidades/carteira-e-cards.md) |
| `tradeHistory.js` (base compartilhada) | — | [saldos-e-pnl](../funcionalidades/saldos-e-pnl.md) |
| `positions.js` | `/positions`, `/avg-buy-prices` | [saldos-e-pnl](../funcionalidades/saldos-e-pnl.md) |
| `positionMath.js` (pura, usada por `positions.js`) | — | [saldos-e-pnl](../funcionalidades/saldos-e-pnl.md) |
| `openOrders.js` | `/orders`, `/orders/:asset` | [ordens-abertas](../funcionalidades/ordens-abertas.md) |
| `executedOrders.js` | `/executed-orders` | [ordens-executadas](../funcionalidades/ordens-executadas.md) |
| `priceChart.js` | `/price-chart/:asset` | [velas-e-timeframe](../funcionalidades/grafico-de-preco/velas-e-timeframe.md) |
| `orderHistory.js` | `/order-history/:asset` | [abas-de-ordens](../funcionalidades/grafico-de-preco/abas-de-ordens.md) |
| `assetTrades.js` | `/trade-history/:asset` | [abas-de-ordens](../funcionalidades/grafico-de-preco/abas-de-ordens.md) |
| `liquidationMap.js` | `/liquidation-map/:asset` | [mapa-de-liquidacao](../funcionalidades/grafico-de-preco/mapa-de-liquidacao.md) |
| `futuresData.js` | `/futures-data/:asset` | [paineis-de-futuros](../funcionalidades/grafico-de-preco/paineis-de-futuros.md) |
| `liquidations.js` | `/liquidations/:asset` | [liquidacoes-reais](../funcionalidades/grafico-de-preco/liquidacoes-reais.md) |
| `apiKeySettings.js`, `coinalyzeKeySettings.js` | `/settings/*` | [configuracoes](../funcionalidades/configuracoes.md) |

## Cache incremental de trades (`getAllMyTrades`)

É a peça mais sensível do server, porque `myTrades` pesa 20 e a carteira cruza centenas de pares.

- Mantém um `Map` com `symbol → { trades, lastSync }` por processo.
- Na primeira vez, pagina por `fromId` desde 0 até receber menos de 1000. Nas seguintes, busca só a partir de `último id + 1`.
- Intervalo entre sincronizações:
  - par que não negocia mais (`tradable: false`): **uma vez só**;
  - par sem nenhum trade da conta: 30 min;
  - par com trades: 5 min.
- `clearTradesCache()` só roda quando a chave da Binance muda.
- Quem usa: `tradeHistory.js` (P&L e ordens executadas), `orderHistory.js` e `assetTrades.js`.
- Chamadas simultâneas para o mesmo símbolo compartilham a mesma sincronização (`Map syncing` de promises em andamento). Sem isso, duas buscas a partir do mesmo `fromId` duplicariam trades no cache. Não remova essa trava.

## Conversão para USDT

- **Preço atual** (`getPriceInUSDT`): tenta, nesta ordem, o par `XUSDT`; o par invertido `USDTX` (ex.: BRL); a ponte via BTC/ETH/BNB/FDUSD/USDC; o ativo do Earn `LDX` → `X`; e, para BUSD, o valor 1. Sem nada disso, devolve `null` (a moeda fica "sem cotação").
- **Na data do trade** (`rateToUSDTAt` em `tradeHistory.js`): usa o fechamento diário da moeda de cotação ou de taxa naquele dia. Esse cache é carregado por `loadRatesForTrades(trades, symbolInfo, prices, errors)`, que **todo serviço que chama `rateToUSDTAt` sobre trades precisa chamar antes** (`loadTradeHistory` e `assetTrades` já chamam). Sem histórico, cai para o preço atual e, sem preço atual, para 0. Quem exibe valores deve tratar o 0 como "sem cotação": `executedOrders` devolve `totalUSDT: null` e `assetTrades` também. Stablecoins em USD (`USDT, FDUSD, USDC, BUSD`) valem 1.

## Como adicionar algo no server

Ver o checklist em [convencoes](convencoes.md#checklists). Em resumo:

- O serviço novo vai em `services/` e usa `cached` se chamar a Binance.
- A rota vai em `routes.js`, com validação e `handle`.
- O front ganha uma função nova em `public/api/binance.js`.
- Registre a rota em [api.md](../referencia/api.md) e os TTLs em [cache.md](../referencia/cache.md).
