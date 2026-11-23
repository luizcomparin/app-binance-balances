---
titulo: Chaves de localStorage
resumo: Todas as preferências da página salvas no navegador, com formato, padrão e módulo dono.
arquivos: []
rotas: []
eventos: []
storage: [balances-simple-view, ordersOpenPairs, priceChartAsset, priceChartMode, priceChartRange, priceChartInterval, priceChartDynamicAvg, priceChartOpenOrders, priceChartMyOrders, priceChartProjectedAvg, priceChartStats, priceChartStatsDays, priceChartDca, priceChartLiquidation, priceChartFutures, priceChartRealLiquidations, priceChartOrdersTab, priceChartIndicators, priceChartMovingAverages, priceChartIndicatorsVisible, priceChartWatchlistOrder, priceChartWatchlistOpen, priceChartWatchlistColors, priceChartPaneHeights, price-chart-drawings, price-chart-draw-toolbar]
---

# `localStorage`

Só guarda preferências de interface; nenhum dado da conta vai para o navegador. Toda leitura e escrita é feita com `try/catch` (modo privado ou armazenamento bloqueado), e sem armazenamento a página funciona com os valores padrão.

O padrão de nomes é **inconsistente**: há chaves em `camelCase` (`priceChartX`) e em `kebab-case` (`balances-simple-view`, `price-chart-drawings`). Chave nova do gráfico de preço: use `priceChartX`.

| Chave | Formato | Padrão | Dono | Para quê |
|---|---|---|---|---|
| `balances-simple-view` | `"1"`/`"0"` | desligada | `balances/BalancesPanel.js` | "Visão simplificada" da tabela de saldos |
| `ordersOpenPairs` | JSON `string[]` | `[]` | `orders/OrdersPanel.js` | Pares expandidos em Ordens Abertas |
| `priceChartAsset` | `"BTC"` | BTC se em carteira, senão a maior | `PriceChartPanel.js` | Última moeda vista |
| `priceChartMode` | `"line"`/`"candle"` | `line` | `PriceChartPanel.js` | Linha ou velas |
| `priceChartRange` | `7d·30d·90d·6m·1y·2y·all·<n>[dmy]` | `1y` | `PriceChartPanel.js` | Período |
| `priceChartInterval` | `1h·4h·1d·1w·1M` | `1d` | `PriceChartPanel.js` | Tamanho da vela |
| `priceChartDynamicAvg` | `"1"`/`"0"` | on | `PriceChartPanel.js` | Camada "Preço médio dinâmico" (linhas do médio de compra e de venda) |
| `priceChartOpenOrders` | `"1"`/`"0"` | on | `PriceChartPanel.js` | Camada "Ordens abertas" (linhas das compras e vendas abertas) |
| `priceChartMyOrders` | `"1"`/`"0"` | on | `PriceChartPanel.js` | Camada "Ordens realizadas" (bolinhas das compras e vendas realizadas) |
| `priceChartProjectedAvg` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Camada "preço médio após ordens abertas" (liga as linhas de compras e de vendas abertas) |
| `priceChartStats` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Camada faixa estatística |
| `priceChartStatsDays` | número 1–365 | `30` | `PriceChartPanel.js` | Horizonte da faixa estatística |
| `priceChartDca` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Camada compra mensal fixa |
| `priceChartLiquidation` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Camada mapa de liquidação |
| `priceChartFutures` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Painéis de futuros |
| `priceChartRealLiquidations` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Painel de liquidações reais |
| `priceChartOrdersTab` | `open·history·trades` | `open` | `PriceChartPanel.js` | Aba abaixo do gráfico |
| `priceChartIndicators` | JSON `[{ id, kind: "ma"\|"vma"\|"bb", period, type?, mult?, color, opacity, visible }]` | `[]` | `indicatorControls.js` | Indicadores |
| `priceChartIndicatorsVisible` | `"1"`/`"0"` | on | `indicatorControls.js` | Olho geral dos indicadores (`"0"` = todos ocultos, sem alterar o `visible` de cada um) |
| `priceChartMovingAverages` | (legado) | — | `indicatorControls.js` | Lida se `priceChartIndicators` não existir e apagada no 1º save |
| `priceChartWatchlistOrder` | JSON `string[]` | `[]` | `watchlist.js` | Ordem das moedas na lista lateral e no seletor |
| `priceChartWatchlistOpen` | `"1"`/`"0"` | fechada | `watchlist.js` | Lista lateral aberta |
| `priceChartWatchlistColors` | JSON `{ moeda: "#rrggbb" }` | `{}` | `watchlist.js` | Cor de indicação por moeda |
| `priceChartPaneHeights` | JSON `{ volume, oi, ls, funding, liq: px }` | 96 px cada | `chart/futuresPanes.js` | Altura dos painéis abaixo do preço |
| `price-chart-drawings` | JSON `{ moeda: [{ id, type, points: [{ms, price}], dp? }] }` | `{}` | `chart/drawings.js` | Desenhos por moeda |
| `price-chart-draw-toolbar` | JSON `{ left, top }` | canto padrão | `chart/drawingToolbar.js` | Posição da barra de desenho |

Ao criar uma chave, adicione uma linha aqui e no `storage:` do cabeçalho do doc da funcionalidade.
