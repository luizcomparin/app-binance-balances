---
titulo: Caches e TTLs
resumo: Todos os caches do server e do front, com chave, duração e quando são limpos.
arquivos: [server/lib/cache.js]
rotas: []
eventos: []
storage: []
---

# Caches

O app tem **duas camadas de cache**: memória do server, que se perde ao reiniciar, e memória da página, que se perde ao recarregar. Quando um dado parece "velho", a causa costuma ser uma dessas duas.

## Server

`cached(key, ttl, fn)` (`server/lib/cache.js`) memoiza a **promise**. Chamadas simultâneas com a mesma chave compartilham a mesma requisição, e erros saem do cache na hora. `clearCache()` apaga tudo e é chamado quando a chave da Binance ou da Coinalyze muda.

| Dado | Chave `cached` / estrutura | TTL | Onde |
|---|---|---|---|
| Conta (`/api/v3/account`) | `account` | 15 s | `binance/account.js` |
| Ordens abertas | `openOrders` | 15 s | `binance/account.js` |
| `allOrders` por símbolo | `allOrders:<SYMBOL>` | 60 s | `binance/account.js` |
| `myTrades` por símbolo | `Map tradesCache` (fora do `cached`) | incremental: 5 min (com trades), 30 min (sem), única vez (par não negociável) | `binance/account.js` |
| Cotações | `prices` | 15 s | `binance/market.js` |
| Ticker 24h | `tickers24h` | 15 s | `binance/market.js` |
| `exchangeInfo` spot | variável de módulo | 6 h | `binance/market.js` |
| `exchangeInfo` futures (perpétuos) | variável de módulo | 6 h | `binance/futures.js` |
| Fechamentos diários p/ conversão | `Map dailyRateCache` | 1 dia (recarrega se precisar de data mais antiga) | `services/tradeHistory.js` |
| Histórico de trades da carteira | `tradeHistory` | 15 s | `services/tradeHistory.js` |
| Trades de uma moeda | `assetTrades:<ASSET>` | 30 s | `services/assetTrades.js` |
| Velas | `chart:<SYMBOL>:<interval>:<limit>:<before>` | 60 s | `services/priceChart.js` |
| Dados de futuros | `futures:<ASSET>:<period>` | 2 min | `services/futuresData.js` |
| Mapa de liquidação | `liqmap:<ASSET>` | 5 min | `services/liquidationMap.js` |
| Liquidações reais | `liquidations:<ASSET>:<interval>` | 5 min | `services/liquidations.js` |
| Mercados da Coinalyze | `coinalyze:markets` | 24 h | `services/liquidations.js` |

`clearTradesCache()` (trades) só roda quando muda a chave da **Binance**. `dailyRateCache` e os `exchangeInfo` nunca são limpos, porque são dados de mercado.

## Página

| Dado | Estrutura | TTL | Onde |
|---|---|---|---|
| Velas (página mais recente) | `Map chartCache` `asset\|interval\|` | 60 s | `price-chart/chartData.js` |
| Velas (páginas antigas, `before`) | idem `asset\|interval\|before` | 10 min | `price-chart/chartData.js` |
| Suas ordens executadas (todas) | `myOrders` | 60 s | `price-chart/chartData.js` |
| Ordens abertas por moeda | `Map openOrdersCache` | 60 s (falhas não entram) | `price-chart/chartData.js` |
| Mapa de liquidação | `Map liqCache` por moeda | 2 min | `PriceChartPanel.js` |
| Dados de futuros | `Map futCache` `asset\|período` | 2 min (`FUT_CACHE_MS`) | `PriceChartPanel.js` |
| Liquidações reais | `Map liqRealCache` `asset\|vela` | 5 min (só sucesso ou `no-market`) | `PriceChartPanel.js` |
| Histórico de ordens | `hist.cache` por moeda | 60 s | `orderHistoryTable.js` |
| Histórico de trades | `st.cache` por moeda | 30 s | `tradeHistoryTable.js` |
| Posições | `request` em andamento (dedupe) | — (só evita chamadas paralelas) | `core/positions.js` |

Os botões "Recarregar" das abas e o "Atualizar" do topo refazem o fetch, mas o server ainda pode responder do cache dele (15 s ou mais). Isso é intencional, para poupar o peso da API. O "Atualizar" também descarta o cache do cliente da moeda aberta no gráfico de preço (velas mais recentes, ordens abertas, `myOrders`, `hist.cache`, o cache de trades, `liqCache`, `futCache` e `liqRealCache`); as páginas antigas de velas ficam. As camadas ligadas recarregam na hora; as desligadas carregam frescas quando forem ligadas (`refreshLayers` em `PriceChartPanel.js`).
