---
titulo: Gráficos de Distribuição
resumo: Aba com rosca de distribuição (total no centro), barras livre/em ordens por moeda, P&L por moeda e custo vs. valor atual, em Chart.js.
arquivos: [public/components/charts/ChartsPanel.js, public/components/charts/ChartsPanel.html, public/components/charts/ChartsPanel.css, public/components/charts/chartUtils.js, public/components/charts/pnlCharts.js]
rotas: [GET /balances, GET /positions]
eventos: [BALANCES_UPDATED, POSITIONS_UPDATED]
storage: []
---

# Gráficos de Distribuição

## O que faz

A aba `data-tab="charts"` (URL `/site/graficos-de-distribuicao`) tem quatro gráficos Chart.js:

1. **Distribuição (%):** rosca com USDT, BTC, XRP, ETH e "Outros". O total em USDT e BRL fica no centro. A legenda própria mostra % e USDT. A dica de "Outros" lista até 8 moedas.
2. **Valores (USDT):** barras horizontais por moeda, com a parte livre em cor cheia e a parte em ordens mais clara. O valor fica escrito na barra. Mostra só as 15 maiores, com o botão "Mostrar todas (N)".
3. **P&L por moeda:** barras para a direita (lucro, verde) e para a esquerda (prejuízo, vermelho). Entram as 15 de maior |P&L|.
4. **Custo vs. valor atual:** duas barras por moeda, com as 15 de maior custo.

Clicar numa fatia, barra ou item da legenda abre a moeda no gráfico de preço (exceto USDT e "Outros").

## Página

- `ChartsPanel.js`:
  - `initChartsPanel()` escuta `BALANCES_UPDATED` → `renderWalletChart(assets)` e `renderWalletBarChart(assets)`. Também chama `initPnlCharts()`.
  - `HIGHLIGHT` define as cores fixas de USDT/BTC/XRP/ETH (intencional, ver [decisoes](../decisoes.md)). O resto fica em `OTHERS_COLOR`.
  - Plugins próprios do Chart.js: `donutCenter` (texto no centro) e `barValueLabels` (valor na barra).
  - O toggle "mostrar todas" é implementado à mão (`showAllBars`), **sem** usar `createTopToggle` (ver débitos).
- `pnlCharts.js`:
  - `initPnlCharts()` cria dois `createTopToggle` e escuta `POSITIONS_UPDATED`.
  - Usa `positionsWithCost()`, que pega de `state.positions` só as moedas com custo e valor de mercado.
  - Enquanto carrega ou em caso de erro, mostra `#pnlChartStatus` e `#costChartStatus`.
- `chartUtils.js` tem os estilos compartilhados (`TOOLTIP_STYLE`, `AXIS_TICKS`, `GRID`) e as funções `fmt2`, `brlOf`, `pct1`, `fitBarHeight`, `createTopToggle` e `openOnClick(assetAt)` (clique + cursor de mão).
- Ids: `#walletChart`, `#walletLegend`, `#walletBarChart`, `#walletBarWrap`, `#walletBarToggle`, `#pnlChart`, `#pnlChartWrap`, `#pnlChartToggle`, `#pnlChartStatus`, `#costChart`, `#costChartWrap`, `#costChartToggle`, `#costChartStatus`.
- Cada render faz `chart.destroy()` e cria de novo.

## Server

Não há rota própria. Os dados vêm de `/balances` e `/positions` (ver [carteira-e-cards](carteira-e-cards.md) e [saldos-e-pnl](saldos-e-pnl.md)).

## Casos de borda

- A altura das barras acompanha o número de moedas (cerca de 28 px por barra, 40 px no custo vs. valor).
- Os gráficos são desenhados mesmo com a aba oculta (Chart.js `responsive`). Se o canvas estiver em `display:none`, o tamanho pode ajustar só ao exibir.

## Checklist ao alterar

- Novas cores: mantenha a consistência entre `HIGHLIGHT` (ChartsPanel), `chartUtils` e `base.css`.
- Gráfico novo: use os utilitários de `chartUtils.js` (não duplique estilo e toggle) e `openOnClick`.

## Como verificar

1. Abra `/site/graficos-de-distribuicao`.
2. Passe o mouse em "Outros", clique numa barra (deve abrir o gráfico de preço) e use "Mostrar todas".
3. Espere o P&L chegar para ver os dois gráficos de baixo.
