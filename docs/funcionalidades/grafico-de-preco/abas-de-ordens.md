---
titulo: Abas abaixo do gráfico (ordens abertas, histórico de trades, histórico de ordens)
resumo: Três abas no estilo da Binance para a moeda aberta; ordens abertas (de /orders/:asset), histórico de trades com taxa e maker/taker, e histórico de ordens encerradas expansíveis com as execuções.
arquivos: [server/services/orderHistory.js, server/services/assetTrades.js, server/services/openOrders.js, server/binance/account.js, public/components/price-chart/openOrdersTable.js, public/components/price-chart/orderHistoryTable.js, public/components/price-chart/tradeHistoryTable.js, public/components/price-chart/periodFilter.js, public/components/price-chart/loadError.js, public/components/price-chart/PriceChartPanel.js]
rotas: [GET /orders/:asset, GET /order-history/:asset, GET /trade-history/:asset]
eventos: []
storage: [priceChartOrdersTab]
---

# Abas de ordens abaixo do gráfico

O container é `#price-chart-orders`. Os botões `.pco-tab[data-pco-tab="open|trades|history"]` alternam os painéis `.pco-pane[data-pco-pane]`. A aba escolhida fica em `priceChartOrdersTab`. Os históricos só carregam quando a aba é aberta (`showOrdersTab` → `showHistory`/`showTrades`).

## Ordens abertas (`openOrdersTable.js`)

- Dados: `view.openOrders.all`, que vem de `/orders/:asset` via `chartData.loadOpenOrders` (o mesmo dado das linhas de ordens no gráfico).
- Colunas: data, par, tipo (`TYPE_LABELS`, com tag OCO), lado, preço ("Mercado" se for 0), quantidade, iceberg, % executado, total (preço × quantidade original, ou o gatilho nas ordens a mercado) e condição de gatilho (`triggerText`: "Último preço <= x").
- A ordenação é feita clicando no `<th data-sort>` (time, type, side, price). O padrão é preço crescente.
- `renderOpenOrdersTable(el, orders, asset, countEl, error)`: `undefined` = carregando, `null` = erro com "Tentar de novo" (`loadError.js`). A contagem vai para `#pco-open-count`.
- Exporta `typeLabel`, `triggerText` e `quoteAmount`, que são reutilizados pelas outras duas tabelas.

## Histórico de trades (`tradeHistoryTable.js`)

- Server: `GET /trade-history/:asset` → `services/assetTrades.js`. Para cada par `<asset>/<PNL_QUOTES>`, chama `getAllMyTrades` (o cache incremental do P&L), carrega as cotações diárias das moedas de cotação (`loadRatesForTrades`) e converte com `totalUSDT = quoteQty × rateToUSDTAt(quote, time)` (`null` sem cotação). Cache de 30 s.
- Colunas: nº da ordem, data, par, lado, preço, executado, taxa, função (Maker/Taker), total na cotação e total em USDT ("≈"). Ordenável por time, side e total.
- O período padrão é **1 mês** e o cache no cliente vale 30 s.

## Histórico de ordens (`orderHistoryTable.js`)

- Server: `GET /order-history/:asset` → `services/orderHistory.js`. Para cada par, chama `getAllOrders` (as **últimas 1000** do par, 60 s) e `getAllMyTrades`. Exclui as ordens ainda abertas e liga as execuções (`fills`) por `orderId`.
- Colunas: ▾, data, par, tipo, lado, preço médio, preço, executado, quantidade, iceberg, total e gatilho.
  - Ordens canceladas ou expiradas sem execução aparecem esmaecidas (`pco-dim`).
  - Clicar na linha expande as execuções: data, preço, quantidade, total, taxa e função. Não expande se houver texto selecionado.
- Status em PT-BR: `STATUS_LABELS`. O período padrão é **3 meses** e o cache no cliente vale 60 s.

## Filtro de período (`periodFilter.js`)

- Presets 1 dia · 1 semana · 1 mês · 3 meses · Tudo, ou datas De/Até + Buscar / Limpar (ids `pco-from|to|search|reset` e `pct-from|to|search|reset`).
- O filtro é **local**: a lista vem inteira do server e só o que fica dentro do período é exibido. Se a última carga falhou, Buscar tenta de novo.
- `createPeriodFilter(els, { defaultPreset, oldest, onChange })` devolve `{ contains(t), refresh(), dataChanged() }`. Em "Tudo", a data inicial mostrada é a do item mais antigo. Depois de trocar o período, a página rola até o fim.

## Casos de borda

- O histórico de ordens só traz as últimas 1000 ordens **por par** (limite da Binance sem paginação no código).
- As duas tabelas de histórico têm estrutura quase idêntica (ver débitos).

## Como verificar

1. Numa moeda com histórico, abra cada aba.
2. Troque o período e expanda uma ordem executada.
3. Simule um erro (pare o server): deve aparecer "Tentar de novo".
