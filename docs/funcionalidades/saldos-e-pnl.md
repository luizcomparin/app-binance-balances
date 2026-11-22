---
titulo: Saldos por moeda, preço médio e P&L
resumo: Aba Saldos com tabela por moeda e resumo de P&L; /positions calcula custo médio dinâmico, P&L realizado/não realizado e cobertura a partir do histórico de trades.
arquivos: [server/services/positions.js, server/services/tradeHistory.js, server/binance/account.js, public/core/positions.js, public/components/balances/BalancesPanel.js, public/components/balances/BalancesPanel.html, public/components/balances/BalancesPanel.css]
rotas: [GET /positions, GET /avg-buy-prices, GET /balances]
eventos: [BALANCES_UPDATED, POSITIONS_UPDATED]
storage: [balances-simple-view]
---

# Saldos por moeda e P&L

## O que faz

A aba **Saldos por moeda** (`data-tab="balances"`, URL `/site/saldos`) mostra:

- uma tabela ordenável com moeda, %, quantidade, preço atual, 24h, preço médio, livre, em ordens, total, P&L (USDT e %) e realizado;
- um resumo no cabeçalho com o resultado não realizado (USDT, %, BRL), o custo e o realizado;
- a "Visão simplificada", que esconde as colunas `.col-detail` (Qtd, Preço atual, 24h, P&L, P&L %, Realizado);
- avisos: pares que falharam ao buscar trades (`#positions-status`) e moedas sem cotação (`#unpriced-note`);
- ⚠ junto ao preço médio quando a cobertura fica abaixo de 95%;
- clique na moeda (exceto USDT), que abre o gráfico de preço.

O **mesmo** P&L alimenta os gráficos de P&L ([graficos-de-distribuicao](graficos-de-distribuicao.md)) e o preço médio do gráfico de preço.

## Página

- `BalancesPanel.js`:
  - `loadBalances()`: mostra "Carregando...", dispara `loadPositions()` **em paralelo**, busca `/balances`, faz `mergePositions()` e `renderBalances()`, e emite `BALANCES_UPDATED`.
  - `onPositionsUpdated()` (escuta `POSITIONS_UPDATED`) mostra o spinner do resumo enquanto carrega. Ao terminar, mescla e redesenha; em caso de erro, mostra "Falha ao calcular o P&L".
  - `mergePositions()` copia os campos de `state.positions[asset]` para cada linha de `state.currentAssets` (para exibir e ordenar).
  - `sortBalances(key)` (via `onclick` no `<th>`) usa `toggleSort`. Valores ausentes vão sempre para o fim.
- `core/positions.js` → `loadPositions()`: uma requisição por vez, compartilhada. Preenche `state.positions`, `positionsTotals`, `positionsLoading`, `positionsError` e `positionsFailedPairs`, e emite `POSITIONS_UPDATED` no início e no fim.
- Ids: `#balances-table` (classe `is-simple`), `#table-body-balances`, `#balances-simple`, `#pnl-summary` (classe `is-loading`), `#pnl-total`, `#pnl-pct`, `#pnl-brl`, `#pnl-detail`, `#pnl-cost`, `#pnl-realized`, `#positions-status`, `#unpriced-note`.

## Server

`GET /positions` → `services/positions.js` `buildPositions()` → `services/tradeHistory.js` `loadTradeHistory()` (`cached` de 15 s, que garante uma sincronização por vez dentro do serviço):

1. Busca saldos, cotações e `exchangeInfo`.
2. **Holdings:** moedas com `qty > 0`, **exceto** USDT/FDUSD/USDC/BUSD/BRL e `LD*`.
3. Para cada holding, cada par `<moeda>/<cotação>` existente com cotação em `PNL_QUOTES` (`USDT, FDUSD, USDC, BUSD, BRL, BTC, ETH, BNB`) → `getAllMyTrades(symbol)`, com `mapLimit` 4. Falhas por par vão para `errors`. 429/418 aborta tudo.
4. Carrega os **fechamentos diários** de cada moeda de cotação e de taxa não estável, desde o primeiro trade (`loadDailyRates`), para `rateToUSDTAt(asset, time)` converter na data do trade.
5. `computePosition` percorre os trades ordenados por `(time, id)`. O resultado de `/positions` está em [api.md](../referencia/api.md#get-positions).

## Regras de negócio (`computePosition`)

```
compra:  se qty == 0 → novo ciclo (zera soldQtyCycle/soldValueCycle)
         qty  += tradeQty − taxaEmBase
         cost += valorUSDT + taxaUSDT        invested += idem
venda:   soldQty = tradeQty + taxaEmBase ;  matched = min(soldQty, qty) ;  avg = cost/qty
         proceeds = valorUSDT − taxaUSDT
         realized += proceeds × matched/soldQty − avg × matched     (só a parte com custo conhecido)
         cost −= avg × matched ;  qty −= matched
         soldQtyCycle += soldQty ; soldValueCycle += proceeds
qty < 1e-12 → qty = cost = 0
```

- `valorUSDT = quoteQty × rateToUSDTAt(quoteAsset, time)`. A taxa em base reduz a quantidade; a taxa em outra moeda (quote, BNB) é convertida na data e entra no custo ou na receita.
- `avgBuyPriceUSDT = cost / qty` (null se `qty = 0`). `avgSellPriceUSDT = soldValueCycle / soldQtyCycle`.
- Os valores da posição usam a **quantidade do saldo atual** (`h.qty`), não a dos trades: `costBasisUSDT = avg × qty atual`. Se parte veio de depósito, Convert ou Earn, ela "herda" o mesmo médio, e `coverage = trackedQty / qty` sinaliza isso.
- Totais: `costBasis`, `marketValue` e `unrealized` somam só as moedas com custo conhecido. `realized` soma todas.

## Cache e estado persistido

- Server: o `tradeHistory` vale 15 s, e os trades são incrementais (5 min, 30 min ou uma vez só, ver [cache](../referencia/cache.md)).
- Página: `balances-simple-view` no `localStorage`.

## Casos de borda e armadilhas

- A **primeira** carga pode levar vários segundos (centenas de `myTrades`). Por isso o P&L chega depois dos saldos.
- Trades em cotações fora de `PNL_QUOTES` (EUR, TRY…), Convert, P2P e Earn **não entram**.
- Moeda zerada não aparece (só as holdings atuais).
- Sem histórico diário de uma moeda de cotação, a conversão cai para o preço **atual**, o que distorce trades antigos em BRL/BTC.
- ⚠ Uma corrida entre sincronizações de trades pode duplicar trades no cache (ver [debitos-tecnicos](../debitos-tecnicos.md#bugs-e-logicas-potencialmente-quebradas)).

## Checklist ao alterar

- Mudou a fórmula: atualize esta seção, os textos de ajuda (`data-tip` em `BalancesPanel.html`, `INFO_HELP` em `PriceChartPanel.js`, `AVG_HELP` em `chart/overlays.js`) e o [glossario](../referencia/glossario.md).
- Campo novo em `positions`: `mergePositions`, [api.md](../referencia/api.md) e os consumidores (pnlCharts, PriceChartPanel).
- Coluna nova: `BALANCE_COLUMNS` (colspan), `<th>` com `onclick="sortBalances('campo')"`, `.col-detail` se for ocultável.

## Como verificar

1. Abra `/site/saldos`: o resumo mostra "Calculando P&L..." e depois os valores.
2. Ordene por P&L.
3. Ligue e desligue a "Visão simplificada" e recarregue (a escolha persiste).
4. Compare o preço médio de uma moeda conhecida com a sua conta.
5. Clique na moeda: deve abrir o gráfico de preço.
