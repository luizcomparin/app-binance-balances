---
titulo: Gráfico de preço — visão geral do módulo
resumo: Aba principal do app, um gráfico estilo TradingView (Lightweight Charts) da moeda em USDT com camadas de análise, painéis de futuros, desenhos, watchlist e abas de ordens; mapa dos ~25 arquivos.
arquivos: [public/components/price-chart/PriceChartPanel.js, public/components/price-chart/PriceChartPanel.html, public/components/price-chart/PriceChartPanel.css, public/components/price-chart/chart/createChart.js, public/components/price-chart/chart/chart.css, public/components/price-chart/loadError.js]
rotas: [GET /price-chart/:asset, GET /orders/:asset, GET /executed-orders, GET /order-history/:asset, GET /trade-history/:asset, GET /liquidation-map/:asset, GET /futures-data/:asset, GET /liquidations/:asset, GET /fear-greed]
eventos: [BALANCES_UPDATED, POSITIONS_UPDATED, TAB_CHANGED, COINALYZE_KEY_CHANGED]
storage: [priceChartAsset, priceChartMode, priceChartScale, priceChartRange, priceChartInterval]
---

# Gráfico de preço

Esta é a aba padrão (`data-tab="price-chart"`, `/site/grafico-de-preco`). Ela mostra o preço em USDT da moeda escolhida, em linha ou velas, com zoom e arrasto, e o histórico antigo é carregado sob demanda. Por cima do preço vêm as camadas: seus preços médios, suas ordens, ordens abertas, indicadores, desenhos e estatísticas. Embaixo ficam os painéis de volume e de futuros e as abas de ordens.

Qualquer parte do app abre uma moeda aqui com `window.openPriceChart(asset)`.

## Layout (`PriceChartPanel.html`)

```
┌ cabeçalho ───────────────────────────────────────────────────────────────┐
│ [XRP / USDT ▾] (seletor)   #price-chart-info: preço atual · médio · vs. médio   [Sinais ▾] │
│ #price-chart-mas: indicadores (+ Adicionar)                               │
│ Linha|Velas · Linear|Log · 1h 4h D S M · 7d 30d 90d 6m 1a 2a Tudo Personalizado · ⚙ camadas │
│                                                  [Ajustar zoom] [☰ lista]   │
├ #price-chart-canvas-wrap ─────────────────────────────┬ #price-chart-watchlist ┤
│ barra superior: ↑ ordens fora · resumo · legenda      │ moedas (arrastáveis)  │
│ #priceChartContainer (Lightweight Charts)             │                       │
│   painel 0: preço + linhas + marcadores + mapa + desenhos + régua            │
│   painéis 1..N: volume · CVD · RSI · MACD · liquidações · Fear & Greed · OI · long/short · funding │
├ caixas de texto: faixa estatística · DCA · mapa de liquidação ───────────────┤
└ #price-chart-orders: Ordens abertas | Histórico de trades | Histórico de ordens ┘
```

## Arquivos → subdoc

| Arquivo | O que faz | Doc |
|---|---|---|
| `PriceChartPanel.js` | Orquestrador: estado `view`, controles, cargas, `render()` → `chart.update()` | este doc |
| `chart/createChart.js` | Cria o Lightweight Charts **uma vez**. `update(opts)`, `clear()`, `fit()`, `getVisibleWindow()`. Séries, indicadores, crosshair/tooltip, histórico sob demanda | este doc e os subdocs |
| `chartData.js` | Cache no cliente: `getKlines`, `loadMyOrders`, `loadOpenOrders`, `ordersOnChart`, `invalidateAssetCache` | [velas-e-timeframe](velas-e-timeframe.md), [sobreposicoes-e-legenda](sobreposicoes-e-legenda.md) |
| `timeframe.js`, `chart/axis.js` | Período × vela; tempo/fuso e formato de preço | [velas-e-timeframe](velas-e-timeframe.md) |
| `chart/overlays.js`, `chart/legend.js`, `chart/tooltip.js` | Linhas de preço, marcadores, legenda, tooltip | [sobreposicoes-e-legenda](sobreposicoes-e-legenda.md) |
| `indicatorControls.js`, `chart/movingAverage.js`, `chart/bollinger.js` | Indicadores | [indicadores](indicadores.md) |
| `chart/drawings.js`, `chart/drawingToolbar.js`, `chart/measureTool.js` | Desenhos e régua | [desenhos-e-regua](desenhos-e-regua.md) |
| `buySimulator.js` | Simulador de compra e médios projetados | [simulador-e-projecoes](simulador-e-projecoes.md) |
| `volatility.js` | Faixa estatística | [faixa-estatistica](faixa-estatistica.md) |
| `dca.js` | Comparação com compra mensal fixa | [comparacao-dca](comparacao-dca.md) |
| `chart/liquidationOverlay.js` | Mapa de liquidação desenhado | [mapa-de-liquidacao](mapa-de-liquidacao.md) |
| `chart/liquidationBubbles.js` | Liquidações reais sobre o gráfico (perfil por preço, bolhas, maiores eventos), posicionadas pelas velas de 1h | [liquidacoes-reais](liquidacoes-reais.md) |
| `chart/futuresPanes.js`, `chart/cvd.js`, `paneSettings.js` | Painéis de volume, CVD/Delta, RSI, MACD, liquidações, Fear & Greed, OI, L/S e funding (engrenagem de configurações no volume, no CVD, no RSI e no MACD; `paneSettings.js` também tem o formulário da engrenagem do mapa de liquidação) | [paineis-de-futuros](paineis-de-futuros.md), [liquidacoes-reais](liquidacoes-reais.md), [rsi](rsi.md), [macd](macd.md), [fear-and-greed](fear-and-greed.md), [mapa-de-liquidacao](mapa-de-liquidacao.md) |
| `chart/rsi.js` | Cálculo do RSI e limites das configurações | [rsi](rsi.md) |
| `chart/macd.js` | Cálculo do MACD, tons do histograma e limites das configurações | [macd](macd.md) |
| `chart/fearGreed.js` | Zonas (nome e cor) do Fear & Greed Index e encaixe do valor diário nas velas | [fear-and-greed](fear-and-greed.md) |
| `signals/signals.js`, `signals/signalsPanel.js`, `signals/signals.css` | Sinais de compra e venda no diário e no semanal: núcleo de cálculo puro, e o campo "Sinais" do cabeçalho com a janela de detalhes | [sinais](../../sinais/README.md) |
| `watchlist.js`, `assetPicker.js` | Lista lateral e seletor do título | [watchlist-e-seletor](watchlist-e-seletor.md) |
| `chartQuote.js` | Cotação do gráfico: USDT em USDT/BRL, demais em USDT (`quoteOf`, `pairLabel`, preço das ordens na cotação do gráfico) | [watchlist-e-seletor](watchlist-e-seletor.md) |
| `openOrdersTable.js`, `orderHistoryTable.js`, `tradeHistoryTable.js`, `periodFilter.js`, `loadError.js` | Abas abaixo do gráfico | [abas-de-ordens](abas-de-ordens.md) |
| `PriceChartPanel.css`, `chart/chart.css` | Estilos do painel e do que é desenhado por cima do canvas (tooltip, títulos dos painéis, barra de desenho…) | — |

## Estado `view`

Fica em `PriceChartPanel.js`, no nível do módulo.

| Campo | Significado |
|---|---|
| `asset` | Moeda aberta (`null` até escolher) |
| `range`, `interval`, `mode`, `logScale` | Período, tamanho da vela, `"line"`/`"candle"`, eixo de preço logarítmico (persistidos) |
| `requestId` | Incrementado a cada `loadChart`, para descartar respostas antigas |
| `points` | Velas carregadas (`[{ time, open, high, low, close, volume }]`) |
| `loadingOlder`, `reachedStart` | Estado do histórico sob demanda |
| `openOrders` | `{ buys, sells, all, error? }` da moeda (`null` = carregando) |
| `showAvg` (médio dinâmico de compra e venda), `showOpenOrders`, `showMyOrders`, `showProjected` (compras e vendas abertas), `showStats`, `statsDays`, `showDca`, `showLiq`, `showFut` (`{ oi, ls, funding }`), `showLiqReal`, `showFng` | Camadas ligadas (persistidas) |
| `vol`, `dca`, `liq` | Dados das camadas: `undefined` = carregando, `null` = não carregado ou erro |
| `fut`, `liqReal` | `{ key, data }` ou `{ key, loading: true }`, com chave `asset\|período` / `asset\|vela` |
| `fng` | `{ data, at }` ou `{ loading: true, data }` do Fear & Greed Index: um só para todas as moedas e velas |

## Ciclo de vida

1. **`initPriceChartPanel()`**, chamada no boot:
   - liga todos os controles;
   - cria `chart = createPriceChart(...)`, só se `window.LightweightCharts` existir;
   - inicia o seletor, a watchlist, os indicadores e as abas de ordens;
   - escuta:
     - `POSITIONS_UPDATED`: chegou o preço médio, então redesenha;
     - `BALANCES_UPDATED`: atualiza a watchlist e, se a aba estiver aberta sem moeda, escolhe a inicial;
     - `TAB_CHANGED`: ao entrar na aba, abre a moeda inicial ou redesenha;
     - `COINALYZE_KEY_CHANGED`.
2. **Moeda inicial** (`openInitialAsset`): a última vista (`priceChartAsset`), senão BTC se estiver em carteira, senão a moeda de maior valor (espera os saldos).
3. **`openPriceChart(asset)`**:
   - salva a moeda e chama `showTab`;
   - zera `points`, `openOrders`, `vol`, `dca` e `liq`;
   - recarrega as camadas ligadas;
   - `chart.clear()`;
   - atualiza o título, a watchlist e as abas de ordens;
   - `loadChart()`;
   - em paralelo, `loadSignals(asset)` (ver [sinais](../../sinais/README.md)), `loadMyOrders()` e `reloadOpenOrders(asset)`.
4. **`refreshPriceChart()`**, chamada pelo "Atualizar" do topo (`Topbar.js`):
   - descarta o cache do cliente da moeda aberta (`invalidateAssetCache`);
   - busca de novo as ordens abertas, as executadas e a aba de histórico visível;
   - `loadSignals(asset)`: recalcula os sinais;
   - `refreshLayers(asset)`: recarrega as camadas ligadas (vol, DCA, mapa, futuros, liquidações, Fear & Greed) e zera as desligadas;
   - com a aba na tela, chama `loadChart({ keepWindow: true })`.
5. **`loadChart({ keepWindow })`**: carrega as velas que cobrem a janela (ver [velas-e-timeframe](velas-e-timeframe.md)) e depois chama `render({ window })` e `renderInfo()`.
6. **`render(extra)`**: monta **todas** as opções e chama `chart.update(opts)`. É chamado sempre que algo muda (dados, camada, posição, ordens). O `createChart` decide o que redesenhar: só recria a série ao trocar Linha/Velas, e só refaz os dados quando `points` muda.

`chart.update(opts)` recebe: `asset, points, interval, mode, logScale, avg, avgSell, orders, openOrders, projectedAvg, projectedSellAvg, statBand, fixedAvg, dcaAvg, indicators, volume, volumeAverages, cvd, rsi, macd, summary, liquidation, futures, futuresPanes, liquidations, fearGreed` e, opcionalmente, `window` / `prepended`.

## Cabeçalho de informações (`renderInfo`)

Mostra o preço atual, o **preço médio dinâmico de compra**, "Vs. preço médio" (dois valores: a % acima ou abaixo do médio e a % que o preço precisa andar para voltar ao médio) e o **preço médio dinâmico de venda**. Os textos de ajuda estão em `INFO_HELP`.

## Como adicionar uma camada

1. Em `PriceChartPanel.html`, adicione um `<label class="price-chart-sim-toggle pc-chip" id="price-chart-x-label"><input type="checkbox" id="price-chart-x">…` dentro de `#price-chart-layers`, no grupo certo: abaixo do título "No gráfico" (desenha sobre o gráfico principal) ou "Painéis abaixo do gráfico" (cria painel separado). Se a camada tiver texto, crie também uma caixa `<div class="price-chart-stats" id="price-chart-x-box" data-title="…" hidden>`.
2. Em `PriceChartPanel.js`, adicione a constante `X_STORAGE_KEY`, `view.showX = readStored(...) === "1"` e `view.x`. Ligue o checkbox em `initPriceChartPanel()`. Em `openPriceChart()` e em `refreshLayers()` (Atualizar do topo), zere e recarregue. Crie `loadX(asset)` com proteção de corrida (`if (view.asset !== asset) return`) e `renderX()` para a caixa.
3. Em `render()`, passe o dado novo para `chart.update`.
4. Em `chart/createChart.js` `update()`, desenhe usando uma linha de preço (`overlays.drawPriceLines`), um primitive anexado à série (padrão de `LiquidationOverlay`/`BandFill`) ou um painel (`futuresPanes`). Lembre de limpar em `clear()`.
5. Se a camada usar dado novo do server, siga o [checklist de rota](../../arquitetura/convencoes.md#nova-rota).
6. Docs: um subdoc novo aqui, a linha na tabela acima, a chave em [armazenamento-local](../../referencia/armazenamento-local.md) e a linha no `AGENTS.md`.

## Casos de borda e armadilhas

- `PriceChartPanel.js` tem cerca de 1200 linhas e concentra muita coisa (ver [debitos-tecnicos](../../debitos-tecnicos.md)). Prefira pôr lógica nova em módulos próprios.
- Sempre proteja os `await` contra troca de moeda, período ou vela no meio (`requestId` / `view.asset`).
- Fora da aba (`!isOpen()`), as mudanças não redesenham: o redesenho acontece ao voltar (`TAB_CHANGED`).
- Sem internet (sem CDN), `chart` fica `null` e os `chart?.` evitam quebrar.

## Como verificar

1. Abra `/site/grafico-de-preco`.
2. Troque a moeda (pelo seletor e pela watchlist), alterne Linha/Velas, troque a vela e o período, arraste para o passado (o histórico antigo carrega) e ligue cada camada em ⚙.
3. Recarregue a página: as escolhas persistem.
