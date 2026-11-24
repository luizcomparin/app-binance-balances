---
titulo: Referência da API local
resumo: Todas as rotas HTTP do server, com parâmetros, validação, resposta, erros, serviço responsável e quem consome na página.
arquivos: [server/routes.js, public/api/binance.js]
rotas: [GET /settings/api-key, POST /settings/api-key, GET /settings/coinalyze-key, POST /settings/coinalyze-key, GET /raw, GET /balances, GET /positions, GET /avg-buy-prices, GET /orders, GET /orders/:asset, GET /order-history/:asset, GET /trade-history/:asset, GET /liquidation-map/:asset, GET /futures-data/:asset, GET /liquidations/:asset, GET /executed-orders, GET /price-chart/:asset, GET /site, GET /site/:page]
eventos: []
storage: []
---

# API local

Todas as rotas estão em `server/routes.js`. Do lado da página, as funções correspondentes estão em `public/api/binance.js`. Formato de erro e o `handle()`: ver [visao-geral](../arquitetura/visao-geral.md#contrato-de-erro).

**Validação comum de `:asset`:** o middleware `validAsset` (em `routes.js`) faz `String(param).toUpperCase()` + `/^[A-Z0-9]{1,20}$/`, senão responde `400 { error: "Moeda inválida" }`. A moeda normalizada fica em `req.asset`. Vale para todas as rotas com `:asset`.

**Sem chave da Binance:** as rotas que chamam `signedGet` respondem `401 { code: "API_KEY_MISSING" }`. São elas `/raw`, `/balances`, `/positions`, `/avg-buy-prices`, `/orders*`, `/order-history`, `/trade-history` e `/executed-orders`. As rotas de mercado (`/price-chart`, `/liquidation-map`, `/futures-data`) funcionam sem chave.

## Resumo

| Método e rota | Serviço | Função no front | Quem usa na página | Cache no server |
|---|---|---|---|---|
| `GET /settings/api-key` | `apiKeyStatus` | `fetchApiKeyStatus` | SettingsModal (boot) | — |
| `POST /settings/api-key` | `changeApiKey` | `saveApiKey` | SettingsModal | — |
| `GET /settings/coinalyze-key` | `coinalyzeKeyStatus` | `fetchCoinalyzeKeyStatus` | SettingsModal | — |
| `POST /settings/coinalyze-key` | `changeCoinalyzeKey` | `saveCoinalyzeKey` | SettingsModal | — |
| `GET /raw` | `getRawBinanceAccount` | `fetchRaw` (**não usada**) | — | 15 s |
| `GET /balances` | `buildWalletData` | `fetchBalances` | BalancesPanel → todos via `BALANCES_UPDATED` | 15 s (conta e tickers) |
| `GET /positions` | `buildPositions` | `fetchPositions` | `core/positions.js` | 15 s + trades incrementais |
| `GET /avg-buy-prices` | `buildPositions` | — (compatibilidade) | — | idem |
| `GET /orders` | `buildOpenOrders` + `groupOrdersByAsset` | `fetchOrders` | OrdersPanel | 15 s |
| `GET /orders/:asset` | idem, filtrado | `fetchOpenOrdersForAsset` | gráfico de preço (`chartData.loadOpenOrders`) | 15 s |
| `GET /order-history/:asset` | `buildOrderHistory` | `fetchOrderHistory` | `orderHistoryTable.js` | `allOrders` 60 s + trades |
| `GET /trade-history/:asset` | `buildAssetTrades` | `fetchAssetTrades` | `tradeHistoryTable.js` | 30 s + trades |
| `GET /liquidation-map/:asset` | `buildLiquidationMap` | `fetchLiquidationMap` | PriceChartPanel (camada mapa) | 5 min |
| `GET /futures-data/:asset` | `buildFuturesData` | `fetchFuturesData` | PriceChartPanel (painéis) | 2 min |
| `GET /liquidations/:asset` | `buildLiquidations` | `fetchLiquidations` | PriceChartPanel (painel) | 5 min |
| `GET /executed-orders` | `buildExecutedOrders` | `fetchExecutedOrders` | ExecutedOrdersPanel, `chartData.loadMyOrders` | 15 s + trades |
| `GET /price-chart/:asset` | `buildPriceChart` | `fetchKlines` | `chartData.getKlines` | 60 s |
| `GET /site`, `/site/:page` | `server.js` | — | navegador | — |

## Detalhes

### `GET /settings/api-key`
Resposta: `{ configured: boolean, keyHint: "…abcd" | null }`. O secret **nunca** é devolvido.

### `POST /settings/api-key`
- Middleware `sameOriginJson`: se vier `Origin`, ela precisa ser `localhost`/`127.0.0.1:<PORT>`, e o `Content-Type` precisa ser `application/json`. Senão, `403`. Limite do corpo: 2 kb.
- Corpo: `{ apiKey, apiSecret }`, ambos `/^[A-Za-z0-9]{16,128}$/`.
- O que faz:
  1. Testa as chaves com `signedGetWith(creds, "/api/v3/account")`.
  2. Lê `/sapi/v1/account/apiRestrictions` para gerar avisos de permissão.
  3. Passa a usar as chaves na hora e limpa `clearCache()` e `clearTradesCache()`.
  4. Grava no `.env` **depois** de responder (`res.on("finish")`), porque o nodemon reinicia ao ver o `.env` mudar.
- Resposta: `{ configured, keyHint, warnings: string[] }`. Erro: `400 { error }` com mensagem amigável.

### `GET|POST /settings/coinalyze-key`
- GET: `{ configured, keyHint }`.
- POST: corpo `{ apiKey }`, com `/^[A-Za-z0-9-]{16,128}$/`. **Vazio remove a chave.** Testa com `GET /exchanges` na Coinalyze, limpa `clearCache()` e grava no `.env` depois de responder. Resposta: `{ configured, keyHint }`.

### `GET /raw`
JSON cru de `/api/v3/account` (saldos, permissões…). Não é usada pela página.

### `GET /balances`
```js
{ total_usdt, usdt_brl_price | null, change_24h_usdt, change_24h_pct | null,
  assets: [{ asset, qty, priceUSDT, freeUSDT, lockedUSDT, totalUSDT, change24hPct, change24hUSDT, pct }], // ordenado por pct desc
  unpriced: [{ asset, qty }] }   // sem cotação: fora do total
```
Note o **snake_case** no nível de cima e o camelCase dentro de `assets`. Veja [carteira-e-cards](../funcionalidades/carteira-e-cards.md).

### `GET /positions`
```js
{ positions: { [asset]: { asset, qty, currentPriceUSDT, avgBuyPriceUSDT, avgSellPriceUSDT, soldQtyCycle,
                          costBasisUSDT, marketValueUSDT, unrealizedPnlUSDT, unrealizedPnlPct, realizedPnlUSDT,
                          investedUSDT, coverage, tradesCount, symbols } },
  totals: { costBasisUSDT, marketValueUSDT, unrealizedPnlUSDT, unrealizedPnlPct, realizedPnlUSDT },
  errors: [{ symbol, error }], generatedAt }
```
Só cobre as moedas **em carteira**, excluindo stablecoins em USD, BRL e `LD*`. Veja [saldos-e-pnl](../funcionalidades/saldos-e-pnl.md).

### `GET /avg-buy-prices`
`{ [asset]: avgBuyPriceUSDT }`. Existe por compatibilidade; a página não usa.

### `GET /orders` e `GET /orders/:asset`
- `/orders`: `{ [baseAsset]: Order[] }`.
- `/orders/:asset`: `Order[]` (ou `[]`).
- Cada `Order` é a ordem crua da Binance acrescida de `baseAsset, quoteAsset, remainingQty, totalQuote, quotePriceUSDT, totalUSDT | null, currentPrice, distancePct, marketValueUSDT`. Veja [ordens-abertas](../funcionalidades/ordens-abertas.md).

### `GET /order-history/:asset`
`{ asset, orders: [...], errors, generatedAt }`.
- Ordens **encerradas** (sem `NEW`, `PARTIALLY_FILLED` ou `PENDING_NEW`) de todos os pares `<asset>/{USDT,FDUSD,USDC,BUSD,BRL,BTC,ETH,BNB}`.
- Usa as **últimas 1000 por par** e ordena por `time` desc.
- Cada ordem traz `fills: [{ time, price, qty, quoteQty, commission, commissionAsset, isMaker }]`, além de `avgPrice` e outros campos.

### `GET /trade-history/:asset`
`{ asset, trades: [{ id, orderId, symbol, baseAsset, quoteAsset, time, side, price, qty, quoteQty, totalUSDT | null, commission, commissionAsset, isMaker }], errors, generatedAt }`, ordenados por `time` desc.

### `GET /executed-orders`
`{ orders: [{ symbol, orderId, baseAsset, quoteAsset, side, qty, quoteQty, totalUSDT | null (sem cotação), fees: {asset: qty}, feeUSDT, fills, time, avgPrice }], errors, generatedAt }`. São os trades agrupados por ordem, **só das moedas em carteira**.

### `GET /price-chart/:asset`
Parâmetros:
- `interval=1h|4h|1d|1w|1M`, com `limit` opcional de 1 a 1000 (padrão 1000) e `before=<ms>` opcional (velas que terminam antes desse instante). Qualquer outro `interval` dá `400 "Intervalo inválido"`.
- Compatibilidade: sem `interval`, `range=7d|30d|90d|1y|all` ou `<n>d|<n>m|<n>y` escolhe a vela. Com `before`, devolve 500 velas.

Resposta: `{ asset, symbol, interval, points: [{ time, open, high, low, close, volume, buyVolume }] }`. O volume vem em USDT. `buyVolume` é a parte do volume que veio de compras agressivas da moeda (o *taker buy*), também em USDT, e alimenta o indicador CVD/Delta. No par invertido, vale `volume − USDT comprado`. Para moeda só com par `USDT<asset>`, o preço é invertido.

Erro quando não existe par: `500 "Não existe par X/USDT na Binance"`. Veja [velas-e-timeframe](../funcionalidades/grafico-de-preco/velas-e-timeframe.md).

### `GET /liquidation-map/:asset`
`{ available: true, asset, symbol, multiplier, price, bucket, from, hours, ratios: { globalLongAccount, topLongPosition }, levels: [{ price, long, short }], segments: [{ p, s: "L"|"S", f, t|null, u }], model, generatedAt }`.

Sem dados: `{ available: false, reason: "no-perpetual" | "no-data" }`. Veja [mapa-de-liquidacao](../funcionalidades/grafico-de-preco/mapa-de-liquidacao.md).

### `GET /futures-data/:asset?period=1h|4h|1d`
Período padrão: `1d`. Outro valor dá `400 "Período inválido"`.

Resposta: `{ available: true, asset, symbol, multiplier, period, oi: [{t,v}], globalLS: [{t,l}], topLS: [{t,l}], funding: [{t,r}], nextFunding: {r,t} | null, generatedAt }`.

Sem perpétuo: `{ available: false, reason: "no-perpetual" }`. Veja [paineis-de-futuros](../funcionalidades/grafico-de-preco/paineis-de-futuros.md).

### `GET /liquidations/:asset?interval=1h|4h|1d|1w|1M`
Resposta: `{ available: true, asset, interval, exchanges: [...], rows: [{ t, long, short, by: { Binance: {long, short}, ... } }], generatedAt }`.

Sem dados: `{ available: false, reason: "no-key" | "invalid-key" | "no-market" | "error", message? }`, **sempre com status 200**. Veja [liquidacoes-reais](../funcionalidades/grafico-de-preco/liquidacoes-reais.md).

## Ao criar ou alterar uma rota

Siga o [checklist de convenções](../arquitetura/convencoes.md#nova-rota) e atualize a tabela acima e a seção de detalhes.
