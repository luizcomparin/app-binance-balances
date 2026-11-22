---
titulo: Ordens Abertas
resumo: Aba com ordens abertas agrupadas por par (linha-resumo expansível), filtros de par/lado, distância até executar, somatórios e simulação "se todas executarem".
arquivos: [server/services/openOrders.js, server/binance/account.js, public/components/orders/OrdersPanel.js, public/components/orders/OrdersPanel.html, public/components/orders/OrdersPanel.css, public/components/orders/orderSimulation.js, public/core/pairCombo.js, public/core/sort.js]
rotas: [GET /orders]
eventos: [BALANCES_UPDATED]
storage: [ordersOpenPairs]
---

# Ordens Abertas

## O que faz

A aba `data-tab="orders"` (URL `/site/ordens-abertas`) tem:

- **Filtros:**
  - par, com busca: campo `pairCombo` (↑ ↓ Enter Esc; vazio = todos);
  - lado: chips BUY e SELL, que aplicam na hora.
- **Resumo do filtrado:** número de ordens, total de compras e total de vendas, sempre separados.
- **Simulação "Se todas as ordens filtradas executarem":** quanto recebe nas vendas, quanto gasta nas compras, o saldo USDT projetado e o patrimônio projetado.
- **Tabela agrupada por par:**
  - A linha-resumo traz a contagem de compras e vendas, a faixa de preço, a compra (↓) e a venda (↑) mais perto de executar, as quantidades, os totais e a ordem mais recente.
  - Clicar na linha expande ou recolhe as ordens do par. Clicar no nome do par abre o gráfico de preço da moeda base.
  - "Expandir/Recolher todos". Os pares expandidos ficam salvos.
  - Distância < 2% fica em destaque (`dist-near`); < 5%, em destaque leve (`dist-mid`).
  - Sem coluna escolhida, os pares são ordenados pela ordem mais perto de executar, e as ordens dentro do par pelo preço.

## Página

- `OrdersPanel.js`:
  - `initOrdersPanel()` liga `pairCombo`, os chips, a delegação de clique em `#table-body-orders` e `#orders-expand-all`.
  - `loadOrders()` (exposta em `window`, botão Recarregar e Topbar) busca `/orders` via `fetchOrders`. Achata o resultado em `state.orders` com `pair, side, type, quoteAsset, price, amount, totalQuote, total (USDT), totalUnknown, time, distancePct, marketValueUSDT`.
  - `applyOrderFilters()` preenche `state.filteredOrders` e chama `renderOrders()`.
  - `renderOrders()`: `groupedOrders()` → `summarize()` por par → `groupRow` + `orderRow`. Também atualiza o resumo e chama `renderOrderSimulation()`.
  - `sortOrders(key)` (via `onclick` nos `<th>`): o mapa `GROUP_SORT` define como cada coluna ordena os grupos.
- `orderSimulation.js`:
  - `renderOrderSimulation()` usa `state.filteredOrders` e `state.currentAssets`.
  - `initOrderSimulation()` recalcula em `BALANCES_UPDATED`.
  - Ids: `#orders-simulation`, `#sim-sells`, `#sim-buys`, `#sim-usdt`, `#sim-total`.
- `core/pairCombo.js` → `createPairCombo({ input, list, getPairs, isLoaded, onChange })` devolve `{ value(), sync() }`. `sync()` descarta o par escolhido que sumiu depois de recarregar.
- Ids: `#ordersPairSearch`, `#ordersPairList`, `#ordersSideBuy`, `#ordersSideSell`, `#orders-expand-all`, `#orders-count`, `#orders-buys`, `#orders-sells`, `#table-body-orders`.

## Server

`GET /orders` → `services/openOrders.js`:

1. `buildOpenOrders()` busca `getOpenOrders()` (15 s), `getAllPrices()` e `getSymbolInfo()`.
2. Para cada ordem:
   - `price = price || stopPrice`, porque STOP_LOSS e TAKE_PROFIT a mercado têm `price = 0`;
   - `remainingQty = origQty − executedQty`, já que ordens parciais só têm o resto em aberto;
   - `totalQuote = price × remainingQty`;
   - `quotePriceUSDT = getPriceInUSDT(quote)`, e `totalUSDT` vale `null` se não houver cotação;
   - `distancePct = (price − atual)/atual × 100`;
   - `marketValueUSDT` é o valor de hoje da quantidade em aberto.
3. `groupOrdersByAsset()` agrupa por `baseAsset`.

O mesmo serviço atende `/orders/:asset`, usado pelo gráfico de preço (ver [abas-de-ordens](grafico-de-preco/abas-de-ordens.md)).

## Regras da simulação

- **Vendas:** você recebe `Σ total`. O patrimônio muda em `Σ total − Σ valor de mercado hoje` (`sellGain`).
- **Compras:** você gasta `Σ total` e recebe moeda valendo o que pagou, então o patrimônio não muda.
- `Saldo USDT projetado = USDT atual + vendas − compras`.
- `Patrimônio projetado = total atual + sellGain`.

## Casos de borda

- Ordem em par sem cotação para USDT: `total = 0` nos somatórios, e a linha mostra `-- (total na moeda de cotação)`.
- Pares não-USDT: o preço aparece com 8 casas na moeda de cotação.
- Se `/orders` responder com erro (ex.: 401 sem chave), `fetchOrders` (via `getJson`) lança a mensagem do server e a tabela mostra `Erro: <mensagem>`.

## Checklist ao alterar

- Campo novo: `services/openOrders.js` → normalização em `loadOrders` → `summarize`/`groupRow`/`orderRow` → `GROUP_SORT` se for ordenável.
- O `colspan='7'` aparece fixo em três lugares.

## Como verificar

1. Abra `/site/ordens-abertas`.
2. Filtre por par e lado, confira o resumo e a simulação, expanda um par, ordene por Distância e recarregue (os pares expandidos persistem).
3. Clique no nome do par: deve abrir o gráfico de preço.
