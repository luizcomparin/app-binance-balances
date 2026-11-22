---
titulo: Integrações externas
resumo: Endpoints da Binance spot, Binance Futures e Coinalyze usados, limites, tratamento de erros e bibliotecas de CDN.
arquivos: [server/lib/rateLimit.js, server/binance/client.js, server/binance/account.js, server/binance/market.js, server/binance/futures.js, server/coinalyze/client.js, public/index.html]
rotas: []
eventos: []
storage: []
---

# Integrações externas

## Binance spot (`https://api.binance.com`)

O cliente fica em `server/binance/client.js`.

- **Peso:** a Binance limita a 6000/min por IP. O cliente lê `X-MBX-USED-WEIGHT-1M` de cada resposta e, ao passar de **5000**, as próximas requisições esperam o minuto virar (`throttle()`). Em **429/418**, pausa tudo pelo `Retry-After` (padrão 60 s) e tenta a requisição **uma vez** de novo.
- **Assinatura:** HMAC-SHA256 da query com o secret, header `X-MBX-APIKEY`, `recvWindow=10000` e `timestamp = Date.now() + serverTimeOffset`.
- **Relógio:** sincroniza com `/api/v3/time` ao subir e a cada 30 min, compensando metade da latência. Em erro `-1021` (timestamp fora da janela), ressincroniza e tenta uma vez.
- **Sem chave:** `signedGet` rejeita com `MissingCredentialsError` (code `API_KEY_MISSING`, e a rota responde 401).

| Endpoint | Peso (aprox.) | Assinado | Usado em |
|---|---|---|---|
| `GET /api/v3/time` | 1 | não | sincronização de relógio |
| `GET /api/v3/account` (`omitZeroBalances` no teste de chave) | 20 | sim | saldos, teste da chave |
| `GET /sapi/v1/account/apiRestrictions` | 1 | sim | avisos de permissão da chave |
| `GET /api/v3/openOrders` (sem símbolo) | 80 | sim | ordens abertas |
| `GET /api/v3/allOrders?symbol&limit=1000` | 20 | sim | histórico de ordens |
| `GET /api/v3/myTrades?symbol&fromId&limit=1000` | 20 | sim | P&L, ordens executadas, histórico de trades |
| `GET /api/v3/ticker/price` | 4 | não | cotações |
| `GET /api/v3/ticker/24hr?type=MINI` | 80 | não | variação de 24h |
| `GET /api/v3/exchangeInfo` | 20 | não | base/quote/status dos pares |
| `GET /api/v3/klines` | 2 | não | velas e fechamentos diários (conversão histórica) |

A operação mais cara é a primeira carga de `/positions`: um `myTrades` para cada par de cada moeda em carteira, em 8 moedas de cotação. Por isso o cache de trades é incremental (ver [server](../arquitetura/server.md#cache-incremental-de-trades-getallmytrades)).

**Moedas de cotação consideradas para trades** (`PNL_QUOTES` em `tradeHistory.js`): `USDT, FDUSD, USDC, BUSD, BRL, BTC, ETH, BNB`. Trades em outras cotações (EUR, TRY…) não entram no P&L.

**Erros comuns da Binance** (mapeados para mensagem amigável em `apiKeySettings.js`): `-2015`, `-2014` e `-1022` (chave, permissão ou IP).

## Binance Futures USDⓈ-M (`https://fapi.binance.com`)

Dados **públicos**, sem chave. O cliente é `fapiGet` em `server/binance/futures.js`.

- **Limites** (separados do spot), controlados por `server/lib/rateLimit.js`:
  - peso de 2400/min, lido de `X-MBX-USED-WEIGHT-1M` (o app espera o minuto virar ao passar de 2000);
  - séries `/futures/data/*`: 1000 requisições a cada 5 min (o app para em 900).
  - Em 429/418, pausa pelo `Retry-After` e tenta de novo uma vez.
  - Esperas acima de 15 s não seguram a requisição: falham na hora com status 429 e a mensagem "Limite de requisições da Binance Futures atingido (tente em Ns)". O painel mostra "indisponíveis".
- Perpétuos: `GET /fapi/v1/exchangeInfo` (cache de 6 h). Filtra `contractType=PERPETUAL`, `quoteAsset=USDT` e `status=TRADING`.
- Moedas de preço muito baixo são negociadas em lotes. `getPerpetualFor(asset)` tenta os prefixos `""`, `"1000"`, `"1000000"` e `"1M"` e devolve `multiplier` (preço do contrato = preço spot × multiplier).
- Séries `/futures/data/openInterestHist`, `/globalLongShortAccountRatio` e `/topLongShortPositionRatio`: no máximo 500 por requisição e **só 30 dias** de histórico. `futuresDataSeries` pagina para trás com `endTime`.
- `GET /fapi/v1/fundingRate?limit=1000` (cerca de 333 dias), `GET /fapi/v1/premiumIndex` (próximo funding) e `GET /fapi/v1/klines` (mapa de liquidação, em horas).

## Coinalyze (`https://api.coinalyze.net/v1`)

Agregador de derivativos. É **opcional**: só o painel de Liquidações reais usa. A chave gratuita vai no header `api_key`, com limite de cerca de **40 chamadas/min**.

- `GET /exchanges` serve para testar a chave e mapear os códigos das corretoras.
- `GET /future-markets` traz os mercados perpétuos (cache de 24 h).
- `GET /liquidation-history?symbols&interval&from&to&convert_to_usd=true`.
- Os erros chegam com `code`: `COINALYZE_KEY_MISSING`, `COINALYZE_KEY_INVALID` (401), `COINALYZE_RATE_LIMIT` (429) e `COINALYZE_ERROR`.
- **Limite:** `lib/rateLimit.js` usa um limitador por chave, com até 38 requisições por minuto. Em 429, espera o `Retry-After` e tenta de novo uma vez. Esperas acima de 15 s viram `COINALYZE_RATE_LIMIT` na hora.
- O histórico intradiário (1h/4h) da Coinalyze é curto. O app pede 120 dias em 1h e 2 anos em 4h; o diário vai desde 2019.

## Bibliotecas por CDN (`public/index.html`)

| Biblioteca | Versão | Global | Uso |
|---|---|---|---|
| Chart.js | 4.4.1 (UMD) | `Chart` | aba Gráficos de Distribuição |
| TradingView Lightweight Charts | 5.0.8 (standalone) | `window.LightweightCharts` | gráfico de preço (séries, painéis, primitives, markers) |
| Google Fonts – Manrope | — | — | fonte (importada em `core/base.css`) |

A licença do Lightweight Charts (Apache-2.0) exige atribuição, que fica ligada por `attributionLogo: true` em `chart/createChart.js`. Sem internet, os gráficos não carregam: se `window.LightweightCharts` não existir, o gráfico de preço simplesmente não é criado.
