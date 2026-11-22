---
titulo: Ordens Executadas
resumo: Aba com as ordens preenchidas (trades agrupados por ordem) das moedas em carteira, com filtros de par/lado, ordenação e somatórios; carrega só ao abrir a aba.
arquivos: [server/services/executedOrders.js, server/services/tradeHistory.js, public/components/executed/ExecutedOrdersPanel.js, public/components/executed/ExecutedOrdersPanel.html, public/components/executed/ExecutedOrdersPanel.css]
rotas: [GET /executed-orders]
eventos: [TAB_CHANGED]
storage: []
---

# Ordens Executadas

## O que faz

A aba `data-tab="executed"` (URL `/site/ordens-executadas`) tem:

- uma tabela com data, par, lado, preço médio, quantidade, total na moeda de cotação, total em USDT e taxa em USDT;
- filtros de par (busca) e lado, com somatórios de compras e vendas;
- carga **preguiçosa**: só na primeira vez que a aba é aberta (por clique, URL ou Voltar);
- a nota `#executed-status` quando algum par falhou.

> Cobre só as moedas que estão **em carteira hoje**. Moedas já zeradas não aparecem (mesma base do P&L).

## Página

- `ExecutedOrdersPanel.js`:
  - Estado próprio: `executed = { orders, filtered, sort: { key: "time", asc: false }, loaded, loading }`.
  - `initExecutedOrdersPanel()` escuta `TAB_CHANGED` (`"executed"` e ainda não carregado → `loadExecutedOrders()`), liga o `pairCombo` e os chips.
  - `loadExecutedOrders()` (exposta em `window`, botão Recarregar) deduplica a carga em andamento.
  - `applyExecutedFilters()`, `sortExecutedOrders(key)` (via `onclick`) e `renderExecutedOrders()`.
- Ids: `#executedPairSearch`, `#executedPairList`, `#executedSideBuy`, `#executedSideSell`, `#executed-count`, `#executed-buys`, `#executed-sells`, `#executed-status`, `#table-body-executed`.

## Server

`GET /executed-orders` → `services/executedOrders.js` `buildExecutedOrders()`:

1. `loadTradeHistory()`: o **mesmo** histórico do P&L (ver [saldos-e-pnl](saldos-e-pnl.md)).
2. Agrupa os trades por `symbol:orderId` e soma `qty`, `quoteQty`, `totalUSDT` (convertido na data de cada fill), `fees` por moeda, `feeUSDT` e `fills`. `time` = último fill.
3. Uma taxa paga na própria moeda base é convertida por `commission × preço do fill × cotação`.
4. `avgPrice = quoteQty / qty`. A ordenação é por `time` desc.

A mesma rota alimenta os **marcadores das suas ordens** no gráfico de preço (`chartData.loadMyOrders`).

## Casos de borda

- Sem cotação histórica nem atual, `rateToUSDTAt` devolve **0** e o `totalUSDT` vira 0 em silêncio (diferente de `/trade-history`, que devolve `null`; ver débitos).
- A primeira carga pode demorar (histórico de trades), por isso aparece o spinner "a primeira carga pode levar alguns segundos".

## Checklist ao alterar

- Mudar o agrupamento afeta também os marcadores do gráfico de preço ([sobreposicoes-e-legenda](grafico-de-preco/sobreposicoes-e-legenda.md)) e a comparação DCA ([comparacao-dca](grafico-de-preco/comparacao-dca.md)), que usam `/executed-orders`.

## Como verificar

1. Abra `/site/ordens-executadas`: aparece o spinner e depois a tabela.
2. Filtre por par e lado e ordene por Total (USDT).
3. Recarregue a página direto nessa URL: deve carregar sozinha.
