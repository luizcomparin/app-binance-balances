---
titulo: Eventos e estado compartilhado do front
resumo: Campos de core/state.js e eventos de core/events.js, com quem escreve, quem emite e quem escuta.
arquivos: [public/core/state.js, public/core/events.js]
rotas: []
eventos: [BALANCES_UPDATED, POSITIONS_UPDATED, TAB_CHANGED, COINALYZE_KEY_CHANGED]
storage: []
---

# Eventos e estado

## `state` (`public/core/state.js`)

É um objeto mutável compartilhado. Quem escreve é dono do campo; os outros só leem.

| Campo | Escrito por | Lido por | Conteúdo |
|---|---|---|---|
| `currentAssets` | `BalancesPanel.loadBalances` / `mergePositions` | StatGrid (indireto), Simulação, orderSimulation, watchlist, assetPicker, PriceChartPanel (`defaultAsset`) | `assets` de `/balances`, com os campos de posição mesclados (`avgBuyPriceUSDT`, `unrealizedPnlUSDT`…) |
| `usdtBrlPrice` | `loadBalances` | StatGrid, AssetStrip, ChartsPanel, BalancesPanel | Cotação USDT→BRL (0 se não houver) |
| `usdtBrlChange24hPct` | `loadBalances` | watchlist do gráfico de preço | Variação de 24h do par USDT/BRL (null se não houver) |
| `positions` | `core/positions.js` | BalancesPanel, pnlCharts, PriceChartPanel, buySimulator | `positions` de `/positions` (mapa por moeda) |
| `positionsTotals` | `core/positions.js` | BalancesPanel (resumo de P&L) | `totals` de `/positions` |
| `positionsLoading` | `core/positions.js` | BalancesPanel, pnlCharts, PriceChartPanel, buySimulator | `true` enquanto `/positions` carrega |
| `positionsError` | `core/positions.js` | BalancesPanel, pnlCharts | Mensagem de erro ou `null` |
| `positionsFailedPairs` | `core/positions.js` | BalancesPanel | `errors.length` de `/positions` |
| `orders` | `OrdersPanel.loadOrders` | OrdersPanel, pairCombo | Ordens abertas normalizadas (`pair, side, price, amount, total, distancePct…`) |
| `filteredOrders` | `OrdersPanel.applyOrderFilters` | OrdersPanel, orderSimulation | Ordens depois dos filtros de par/lado |
| `orderSort` / `balanceSort` | `core/sort.toggleSort` | OrdersPanel / BalancesPanel | `{ key, asc }` |

Os componentes também guardam estado **próprio**, que não fica em `state`:

- `executed` em `ExecutedOrdersPanel.js`;
- `view` em `PriceChartPanel.js` (ver [grafico-de-preco/README](../funcionalidades/grafico-de-preco/README.md#estado-view));
- `hist` em `orderHistoryTable.js` e `st` em `tradeHistoryTable.js`;
- a lista de indicadores em `indicatorControls.js`;
- ordem e cores em `watchlist.js`.

## Eventos (`public/core/events.js`)

`emit(name, detail)` faz `window.dispatchEvent(new CustomEvent(name, { detail }))`, e `on(name, handler)` chama `handler(e.detail)`. Não há `off` (os listeners duram a vida da página).

| Constante | Nome | `detail` | Emitido por | Escutado por |
|---|---|---|---|---|
| `BALANCES_UPDATED` | `balances:updated` | resposta de `/balances` | `BalancesPanel.loadBalances` | StatGrid, AssetStrip, ChartsPanel (rosca e barras), orderSimulation, PriceChartPanel (watchlist + moeda inicial) |
| `POSITIONS_UPDATED` | `positions:updated` | — (lê `state`) | `core/positions.loadPositions` (no início, com `loading=true`, e no fim) | BalancesPanel, pnlCharts, PriceChartPanel |
| `TAB_CHANGED` | `tab:changed` | nome da aba (`"price-chart"`, `"charts"`, `"balances"`, `"orders"`, `"executed"`) | `Tabs.showTab` (só quando muda) | ExecutedOrdersPanel (carga preguiçosa), PriceChartPanel |
| `COINALYZE_KEY_CHANGED` | `coinalyze-key:changed` | — | SettingsModal (salvou ou removeu a chave da Coinalyze) | PriceChartPanel (`reloadLiquidations`: painel, camada sobre o gráfico e mapa de liquidação); signalsPanel (limpa o cache de liquidações e recalcula os sinais) |

## Chamadas diretas entre componentes

Fora dos eventos, há estas chamadas diretas:

- `window.openPriceChart(asset)`: chamada por BalancesPanel (link na moeda), OrdersPanel (link no par), ChartsPanel/pnlCharts (clique na fatia ou barra) e pela legenda da rosca.
- `openSettings("coinalyze")`: importado pelo PriceChartPanel ao ligar Liquidações sem chave.
- `showTab` / `isTabActive`: importados pelo PriceChartPanel de `tabs/Tabs.js`.
- `renderOrderSimulation()`: chamado diretamente por `OrdersPanel.renderOrders`.
