---
titulo: Sobreposições, legenda e tooltip do gráfico de preço
resumo: Linhas de preço (médios, projetados, faixa, DCA, ordens abertas), marcadores das suas ordens executadas por tamanho de valor, resumo de ordens fora da tela, legenda com liga/desliga e tooltip.
arquivos: [public/components/price-chart/chart/overlays.js, public/components/price-chart/chart/legend.js, public/components/price-chart/chart/tooltip.js, public/components/price-chart/chartData.js, public/components/price-chart/chart/createChart.js]
rotas: [GET /executed-orders, GET /orders/:asset, GET /positions]
eventos: [POSITIONS_UPDATED]
storage: [priceChartDynamicAvg]
---

# Sobreposições, legenda e tooltip

## O que aparece sobre o preço

| Elemento | Origem | Estilo (`COLORS` em `overlays.js`) |
|---|---|---|
| Preço médio dinâmico de **compra** | `state.positions[asset].avgBuyPriceUSDT` | laranja, tracejado |
| Preço médio dinâmico de **venda** | `avgSellPriceUSDT` | azul, tracejado |
| Médio após compras/vendas abertas | camada ([simulador-e-projecoes](simulador-e-projecoes.md)) | roxo / branco, tracejado largo |
| Preço médio fixo e médio mensal fixo | camada DCA ([comparacao-dca](comparacao-dca.md)) | rosa / amarelo |
| Faixa ±1σ | camada estatística ([faixa-estatistica](faixa-estatistica.md)) | cinza pontilhado |
| Ordens abertas | `/orders/:asset` → `chartData.loadOpenOrders` | verde/vermelho pontilhado. Etiqueta `C 0,5 · 49,30 USDT` |
| Suas ordens executadas | `/executed-orders` → `chartData.loadMyOrders` + `ordersOnChart` | bolinhas verdes/vermelhas **no preço exato**. O tamanho segue os quartis do valor |
| Resumo fora da tela | `offscreenSummary` | "↑ 3 vendas acima" / "↓ 1 compra abaixo" |

- As duas linhas do preço médio dinâmico (compra e venda) são ligadas/desligadas juntas pelo checkbox "Preço médio dinâmico" (`#price-chart-avg`, `view.showAvg`) em ⚙ Camadas. Começa ligado; desligado, `render()` passa `avg`/`avgSell` nulos ao gráfico (linhas, legenda e etiquetas somem). O painel de informações não muda.
- O eixo automático **inclui** os preços médios e projetados, mas **não** as ordens abertas (`autoscaleInfoProvider` em `createChart.js`).
- `drawPriceLines(series, previousLines, opts, hidden)` remove e recria todas as linhas a cada `update`.
- `ordersOnChart(points, asset)` encaixa cada ordem executada na vela que a contém (busca binária). `y = totalUSDT / qty`, ou seja, o preço em USDT na data.
- `markerSizeScale`: com 4 ou mais ordens, os limites são os quartis dos totais em USDT e os tamanhos vão de 0,6 a 2,4. Com menos, o tamanho é 1.

## Legenda (`legend.js`)

- Fica na barra superior do gráfico. Mostra os valores dos médios, com explicação no hover (`AVG_HELP` para os médios dinâmicos e fixo; texto próprio em `legend.js` para "Médio após compras abertas", "Médio após vendas abertas" e "Médio mensal fixo").
- Itens clicáveis (liga/desliga, guardados em `s.hidden`, sem persistência): `myBuys`, `mySells`, `openBuys` e `openSells`.
- Mostra a nota "● tamanho = valor" quando há 4 ou mais ordens.

## Tooltip (`tooltip.js` + crosshair em `createChart.js`)

A prioridade em `subscribeCrosshairMove` é esta:

1. régua ou desenho em andamento: esconde;
2. mouse nos painéis de baixo: esconde (os títulos dos painéis mostram os valores);
3. **simulador de compra ligado:** caixa do simulador (`simTooltipHtml`);
4. mouse sobre a **etiqueta** de uma linha de preço médio (lado direito): explicação (`lineHelpTooltipHtml`);
5. mouse sobre um **marcador**: detalhes das suas ordens (par, quantidade, preço, total, taxa, partes, "Hoje: +x%" ou "Preço atual vs. venda");
6. senão: OHLC da vela (ou o preço, no modo linha) mais o resumo das suas ordens naquela vela.

`createTooltip(wrap, container)` posiciona o tooltip ao lado do mouse sem sair do gráfico. O texto é escapado (`escapeHtml`).

## Dados e cache

- `loadMyOrders()`: lista de **todas** as moedas, 60 s, uma requisição em andamento por vez. Em erro, devolve a lista anterior ou `[]`.
- `loadOpenOrders(asset)`: 60 s por moeda. Converte o preço para USDT (`price × quotePriceUSDT`) e ignora ordens sem cotação. Em erro sem cache: `{ all: null, error }`. Em erro **com** cache: devolve os dados antigos com `stale: true`, `staleAt` (horário da última carga boa) e `error`. A tabela de ordens abertas mostra um aviso e as linhas do gráfico continuam com esses dados.

## Casos de borda

- As ordens executadas só existem para as moedas **em carteira** (mesma base do P&L).
- Sem preço médio (moeda sem trades, ou P&L ainda carregando): nenhuma linha. O cabeçalho mostra "calculando...".

## Como verificar

1. Abra uma moeda com trades: aparecem as bolinhas.
2. Passe o mouse sobre uma bolinha (detalhes) e sobre a etiqueta "Preço médio dinâmico de compra" (explicação).
3. Clique em "Suas compras" na legenda: as bolinhas somem.
4. Com ordens abertas fora da faixa visível, aparece o resumo ↑/↓.
5. Em ⚙ Camadas, desmarque "Preço médio dinâmico": as linhas de compra e de venda (e seus itens na legenda) somem; ao recarregar a página, continua desmarcado.
