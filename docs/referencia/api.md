---
titulo: Referência da API local
resumo: Todas as rotas HTTP do server, com parâmetros, validação, resposta, erros, serviço responsável e quem consome na página.
arquivos: [server/routes.js, public/api/binance.js]
rotas: [GET /settings/api-key, POST /settings/api-key, GET /settings/coinalyze-key, POST /settings/coinalyze-key, GET /raw, GET /balances, GET /positions, GET /avg-buy-prices, GET /orders, GET /orders/:asset, GET /order-history/:asset, GET /trade-history/:asset, GET /liquidation-map/:asset, GET /futures-data/:asset, GET /liquidations/:asset, GET /fear-greed, GET /executed-orders, GET /price-chart/:asset, GET /site, GET /site/:page]
eventos: []
storage: []
---

# API local

Todas as rotas estão em `server/routes.js`. Do lado da página, as funções correspondentes estão em `public/api/binance.js`. Formato de erro e o `handle()`: ver [visao-geral](../arquitetura/visao-geral.md#contrato-de-erro).

**Validação comum de `:asset`:** o middleware `validAsset` (em `routes.js`) faz `String(param).toUpperCase()` + `/^[A-Z0-9]{1,20}$/`, senão responde `400 { error: "Moeda inválida" }`. A moeda normalizada fica em `req.asset`. Vale para todas as rotas com `:asset`.

**Sem chave da Binance:** as rotas que chamam `signedGet` respondem `401 { code: "API_KEY_MISSING" }`. São elas `/raw`, `/balances`, `/positions`, `/avg-buy-prices`, `/orders*`, `/order-history`, `/trade-history` e `/executed-orders`. As rotas de mercado (`/price-chart`, `/liquidation-map`, `/futures-data`, `/fear-greed`) funcionam sem chave.

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
| `GET /liquidation-map/:asset` | `buildLiquidationMap` | `fetchLiquidationMap` | PriceChartPanel (camada mapa) | 5 min (+ `/liquidations` 1h, com chave) |
| `GET /futures-data/:asset` | `buildFuturesData` | `fetchFuturesData` | PriceChartPanel (painéis), signalsPanel (sinal de funding, `period=1d`) | 2 min |
| `GET /liquidations/:asset` | `buildLiquidations` | `fetchLiquidations` | PriceChartPanel (painel e camada sobre o gráfico; esta com `interval=1h` também), signalsPanel (sinal de liquidações, `interval=1d`) | 5 min |
| `GET /fear-greed` | `buildFearGreed` | `fetchFearGreed` | PriceChartPanel (painel Fear & Greed), signalsPanel (sinais) | 10 min |
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
{ total_usdt, usdt_brl_price | null, usdt_brl_change_24h_pct | null, change_24h_usdt, change_24h_pct | null,
  assets: [{ asset, qty, priceUSDT, freeUSDT, lockedUSDT, totalUSDT, change24hPct, change24hUSDT, pct }], // ordenado por pct desc
  unpriced: [{ asset, qty }] }   // sem cotação: fora do total
```
`usdt_brl_change_24h_pct` é a variação de 24h do par USDT/BRL (watchlist do gráfico de preço). Note o **snake_case** no nível de cima e o camelCase dentro de `assets`. Veja [carteira-e-cards](../funcionalidades/carteira-e-cards.md).

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

Resposta: `{ asset, symbol, quote, interval, points: [{ time, open, high, low, close, volume, buyVolume }] }`. `quote` é a moeda dos preços: `"USDT"` ou, para `asset = USDT`, `"BRL"` (par `USDTBRL` como na Binance, sem inverter). O volume vem em USDT. `buyVolume` é a parte do volume que veio de compras agressivas da moeda (o *taker buy*), também em USDT, e alimenta o indicador CVD/Delta. No par invertido, vale `volume − USDT comprado`. Para moeda só com par `USDT<asset>`, o preço é invertido.

Erro quando não existe par: `500 "Não existe par X/USDT na Binance"` (ou `"Não existe par USDT/BRL na Binance"`). Veja [velas-e-timeframe](../funcionalidades/grafico-de-preco/velas-e-timeframe.md).

### `GET /liquidation-map/:asset`
`{ available: true, asset, symbol, multiplier, price, bucket, from, hours, ratios: { globalLongAccount, topLongPosition }, levels: [{ price, long, short }], segments: [{ p, s: "L"|"S", f, t|null, u }], calibration, leverage, model, generatedAt }`.

`calibration` (ajuste com liquidações reais da Binance via Coinalyze): `{ available: true, exchange: "Binance", hours, model: { long, short }, real: { long, short }, factor: { long, short } (número ou null), correlation (−1 a 1 ou null) }` ou `{ available: false, reason: "no-key" | "invalid-key" | "no-market" | "error" | "few-hours" | "no-data", message? }`. Com a calibração, `levels` e `segments` já vêm multiplicados pelo fator de cada lado. `correlation` é do modelo já calibrado.

`leverage` (divisão por alavancagem usada): `{ fitted, tiers: [{ leverage, weight }], defaultTiers, hours, correlation: { default, fitted }, validation: { hours, default, fitted } }`. `fitted: false` vem com `reason: "no-data"` (sem liquidações reais), `"few-hours"` ou `"no-gain"` (a ajustada não acertou mais fora do ajuste), e então `tiers` é a padrão. `model.leverageTiers` é a divisão usada e `model.defaultLeverageTiers`, a padrão.

Sem dados: `{ available: false, reason: "no-perpetual" | "no-data" }`. Veja [mapa-de-liquidacao](../funcionalidades/grafico-de-preco/mapa-de-liquidacao.md).

### `GET /futures-data/:asset?period=1h|4h|1d`
Período padrão: `1d`. Outro valor dá `400 "Período inválido"`.

Resposta: `{ available: true, asset, symbol, multiplier, period, oi: [{t,v}], globalLS: [{t,l}], topLS: [{t,l}], funding: [{t,r}], nextFunding: {r,t} | null, generatedAt }`.

Sem perpétuo: `{ available: false, reason: "no-perpetual" }`. Veja [paineis-de-futuros](../funcionalidades/grafico-de-preco/paineis-de-futuros.md).

### `GET /liquidations/:asset?interval=1h|4h|1d|1w|1M`
Resposta: `{ available: true, asset, interval, exchanges: [...], rows: [{ t, long, short, by: { Binance: {long, short}, ... } }], generatedAt }`.

Sem dados: `{ available: false, reason: "no-key" | "invalid-key" | "no-market" | "error", message? }`, **sempre com status 200**. Veja [liquidacoes-reais](../funcionalidades/grafico-de-preco/liquidacoes-reais.md).

### `GET /fear-greed`
Sem parâmetros: o índice é do mercado, não de uma moeda.

Resposta: `{ available: true, source: "alternative.me", rows: [{ t, v, c }], generatedAt }`. `rows` traz todo o histórico diário em ordem de tempo: `t` é o instante do dia em ms (00:00 UTC), `v` o valor de 0 a 100 e `c` a zona informada pela API (`"extreme-fear" | "fear" | "neutral" | "greed" | "extreme-greed"`, ou `null` se vier uma classificação desconhecida).

Sem dados: `{ available: false, reason: "no-data" | "error", message? }`, **sempre com status 200**. Veja [fear-and-greed](../funcionalidades/grafico-de-preco/fear-and-greed.md).

## Ao criar ou alterar uma rota

Siga o [checklist de convenções](../arquitetura/convencoes.md#nova-rota) e atualize a tabela acima e a seção de detalhes.
