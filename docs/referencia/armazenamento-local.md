---
titulo: Chaves de localStorage
resumo: Todas as preferências da página salvas no navegador, com formato, padrão e módulo dono.
arquivos: []
rotas: []
eventos: []
storage: [balances-simple-view, ordersOpenPairs, priceChartAsset, priceChartMode, priceChartRange, priceChartInterval, priceChartDynamicAvg, priceChartOpenOrders, priceChartMyOrders, priceChartProjectedAvg, priceChartSimulator, priceChartStats, priceChartStatsDays, priceChartDca, priceChartLiquidation, priceChartFuturesOi, priceChartFuturesLs, priceChartFuturesFunding, priceChartFutures, priceChartRealLiquidations, priceChartOrdersTab, priceChartIndicators, priceChartMovingAverages, priceChartIndicatorsVisible, priceChartVolumeAverages, priceChartVolumePane, priceChartCvdPane, priceChartCvd, priceChartRsiPane, priceChartRsi, priceChartWatchlistOrder, priceChartWatchlistOpen, priceChartWatchlistColors, priceChartPaneHeights, price-chart-drawings, price-chart-drawings-visible, price-chart-draw-toolbar]
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
| `priceChartSimulator` | `"1"`/`"0"` | off | `buySimulator.js` | Camada "Simular compra até o preço médio" |
| `priceChartStats` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Camada faixa estatística |
| `priceChartStatsDays` | número 1–365 | `30` | `PriceChartPanel.js` | Horizonte da faixa estatística |
| `priceChartDca` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Camada compra mensal fixa |
| `priceChartLiquidation` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Camada mapa de liquidação |
| `priceChartFuturesOi` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Painel "Open interest (futuros)" |
| `priceChartFuturesLs` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Painel "Long/short ratio (futuros)" |
| `priceChartFuturesFunding` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Painel "Taxa de funding (futuros)" |
| `priceChartFutures` | (legado) | — | `PriceChartPanel.js` | Antigo checkbox "Dados de futuros"; só lido como padrão dos 3 acima enquanto não têm valor salvo |
| `priceChartRealLiquidations` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Painel de liquidações reais |
| `priceChartOrdersTab` | `open·history·trades` | `open` | `PriceChartPanel.js` | Aba abaixo do gráfico |
| `priceChartIndicators` | JSON `[{ id, kind: "ma"\|"bb", period, type?, mult?, color, opacity, visible }]` | `[]` | `indicatorControls.js` | Indicadores do preço. Itens antigos `vma` e `cvd` são copiados para as chaves abaixo e somem no próximo save |
| `priceChartVolumeAverages` | JSON `[{ id, kind: "vma", period, type, color, opacity, visible }]` | `[]` | `indicatorControls.js` | Médias móveis do volume (engrenagem do painel de Volume) |
| `priceChartVolumePane` | `"1"`/`"0"` | on | `PriceChartPanel.js` | Painel "Volume" |
| `priceChartCvdPane` | `"1"`/`"0"` | off (ou o CVD antigo de `priceChartIndicators`) | `PriceChartPanel.js` | Painel "CVD / Delta de volume" |
| `priceChartCvd` | JSON `{ type: "CVD"\|"DELTA", color, opacity }` | CVD, `#4dd4ff`, 100% | `paneSettings.js` | Configurações do painel de CVD (engrenagem) |
| `priceChartRsiPane` | `"1"`/`"0"` | off | `PriceChartPanel.js` | Painel "RSI" |
| `priceChartRsi` | JSON `{ period, overbought, oversold, color, opacity }` | 14, 70, 30, `#a78bfa`, 100% | `paneSettings.js` | Configurações do painel do RSI (engrenagem) |
| `priceChartIndicatorsVisible` | `"1"`/`"0"` | on | `indicatorControls.js` | Olho geral dos indicadores (`"0"` = todos ocultos, sem alterar o `visible` de cada um) |
| `priceChartMovingAverages` | (legado) | — | `indicatorControls.js` | Lida se `priceChartIndicators` não existir e apagada no 1º save |
| `priceChartWatchlistOrder` | JSON `string[]` | `[]` | `watchlist.js` | Ordem das moedas na lista lateral e no seletor |
| `priceChartWatchlistOpen` | `"1"`/`"0"` | fechada | `watchlist.js` | Lista lateral aberta |
| `priceChartWatchlistColors` | JSON `{ moeda: "#rrggbb" }` | `{}` | `watchlist.js` | Cor de indicação por moeda |
| `priceChartPaneHeights` | JSON `{ volume, cvd, rsi, oi, ls, funding, liq: px }` | 96 px cada | `chart/futuresPanes.js` | Altura dos painéis abaixo do preço |
| `price-chart-drawings` | JSON `{ moeda: [{ id, type, points: [{ms, price}], dp? }] }` | `{}` | `chart/drawings.js` | Desenhos por moeda |
| `price-chart-drawings-visible` | `"1"`/`"0"` | on | `chart/drawings.js` | Olho da barra de desenhos (`"0"` = todos os desenhos ocultos) |
| `price-chart-draw-toolbar` | JSON `{ left, top }` | canto padrão | `chart/drawingToolbar.js` | Posição da barra de desenho |

Ao criar uma chave, adicione uma linha aqui e no `storage:` do cabeçalho do doc da funcionalidade.
