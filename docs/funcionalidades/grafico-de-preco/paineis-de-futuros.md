---
titulo: Painéis abaixo do gráfico (volume, CVD/Delta, RSI, MACD, open interest, long/short, funding)
resumo: Painéis sincronizados com o eixo de tempo do preço, cada um com seu checkbox nas Camadas: volume, CVD/Delta, RSI e MACD (com engrenagem de configurações no título) e open interest, long/short e funding do contrato perpétuo; alturas ajustáveis e salvas.
arquivos: [server/services/futuresData.js, server/binance/futures.js, public/components/price-chart/chart/futuresPanes.js, public/components/price-chart/chart/cvd.js, public/components/price-chart/paneSettings.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/chart/createChart.js]
rotas: [GET /futures-data/:asset]
eventos: []
storage: [priceChartVolumePane, priceChartCvdPane, priceChartCvd, priceChartFuturesOi, priceChartFuturesLs, priceChartFuturesFunding, priceChartFutures, priceChartPaneHeights]
---

# Painéis de volume, CVD e futuros

## O que faz

Os painéis ficam abaixo do preço, na mesma ordem do gráfico. Zoom, arrasto e mira são compartilhados.

1. **Volume** (USDT, spot), com a camada "Volume" (`#price-chart-volume-pane`), **ligada por padrão**. Verde se a vela fechou em alta, vermelho se em baixa. A engrenagem do título abre as **médias móveis do volume** (lista de pílulas, como as dos [indicadores](indicadores.md)).
2. **CVD / Delta de volume**, com a camada "CVD / Delta de volume" (`#price-chart-cvd-pane`). Mostra quem está mais agressivo, compradores ou vendedores, no mercado à vista. A engrenagem do título abre as configurações:
   - **Mostrar:** "CVD (acumulado)", uma linha na cor escolhida, ou "Delta por vela", um histograma verde/vermelho.
   - **Opacidade** e **cor da linha**.

   O título mostra o valor principal (CVD ou delta da vela) e o outro em seguida, na vela sob a mira ou na última.
   - **Delta da vela** = compras agressivas (a mercado) − vendas agressivas = `2 × buyVolume − volume`, em USDT.
   - **CVD** = soma dos deltas desde a **primeira vela carregada**. Ao carregar histórico antigo, a linha inteira se desloca na vertical; só a direção importa.
   - O dado vem das próprias velas da Binance spot (o *taker buy* de `/api/v3/klines`, campo `buyVolume` de `/price-chart`): não usa chamada extra nem a Coinalyze.
3. **RSI**, com a camada "RSI" (`#price-chart-rsi-pane`) e engrenagem de configurações (ver [rsi](rsi.md)).
4. **MACD**, com a camada "MACD" (`#price-chart-macd-pane`) e engrenagem de configurações (ver [macd](macd.md)).
5. **Liquidações reais** (ver [liquidacoes-reais](liquidacoes-reais.md)).
6. **Open interest** (USDT), com a camada "Open interest (futuros)" (`#price-chart-fut-oi`).
7. **Long/Short** (camada "Long/short ratio (futuros)", `#price-chart-fut-ls`): % de contas compradas (amarelo) e de top traders comprados (azul), com uma linha em 50%.
8. **Funding** (camada "Taxa de funding (futuros)", `#price-chart-fut-funding`): histograma; o título mostra a taxa prevista para a próxima cobrança.

Todos são **independentes**: só os ligados aparecem, sempre **na mesma ordem dos checkboxes** de "Painéis abaixo do gráfico" (a lista acima). Os três de futuros são os últimos. Os dados vêm de uma única chamada (`/futures-data`), feita quando ao menos um está ligado.

O título de cada painel mostra o valor na vela sob a mira (ou o mais recente), com uma explicação no hover (`FUTURES_HELP`). No volume, no CVD, no RSI e no MACD, a engrenagem (`.fp-gear`, logo à direita do nome do painel) abre a caixa de configurações (`.fp-settings`). Só uma fica aberta por vez; clique fora ou Esc fecha. As divisórias entre painéis podem ser arrastadas, e as alturas ficam salvas.

## Server

`GET /futures-data/:asset?period=1h|4h|1d` → `services/futuresData.js`:

1. `getPerpetualFor(asset)`. Sem perpétuo: `{ available: false, reason: "no-perpetual" }`.
2. Busca 30 dias de `openInterestHist` (`sumOpenInterestValue`), `globalLongShortAccountRatio` e `topLongShortPositionRatio` (`longAccount`), mais `fundingRate` (limite de 1000) e `premiumIndex` (próxima taxa).

Cache de 2 min. O formato está em [api.md](../../referencia/api.md#get-futures-dataassetperiod1h4h1d).

## Página

- O período enviado segue o tamanho da vela: 1h → `1h`, 4h → `4h`, D/S/M → `1d` (`FUT_PERIOD`).
- `PriceChartPanel.futuresForChart()` devolve os dados, `PANE_LOADING` (painéis vazios com spinner) ou `null`, e dispara `loadFutures()` quando a chave `asset|período` muda. `loadChart()` também dispara a busca logo no início (em paralelo com as velas), para o spinner dos checkboxes aparecer desde já. O cache no cliente (`futCache`) vale 2 min.
- Cada checkbox tem sua flag (`view.showFut.oi|ls|funding`) e chave de storage (`FUT_PANES`). Sem escolha salva, herda o antigo `priceChartFutures` (um checkbox para os três). `futPanesOn()` lista os ligados, enviados ao gráfico em `futuresPanes`.
- O texto dos checkboxes ligados é atualizado por `updateFuturesAvailability()` ("Carregando…", "sem contrato perpétuo"…).
- Volume e CVD: flags `view.showVolume` / `view.showCvd` (`priceChartVolumePane`, que vale on sem escolha salva, e `priceChartCvdPane`). `render()` envia `volume`, `volumeAverages` (`getVolumeAverages()`) e `cvd` (`getCvdSettings()` ou `null`).
- `paneSettings.js` → `mountPaneSettings(key, el, onChange)` preenche a caixa da engrenagem:
  - `volume`: lista das médias do volume (`initVolumeAverageControls`);
  - `cvd`: Mostrar, opacidade e cor (`priceChartCvd`). Sem escolha salva, herda o CVD que era item de `priceChartIndicators`, inclusive se estava ligado.
  - `rsi`: ver [rsi](rsi.md).
  - `macd`: ver [macd](macd.md).

  RSI e MACD usam um formulário genérico de campos `data-k` (`fieldBuilders`, `mountKeyedForm`).

  O `createPriceChart` recebe isso como `handlers.mountPaneSettings` e o repassa a `createFuturesPanes(chart, wrap, { mountSettings })`.
- `chart/cvd.js` → `volumeDelta(points)` → `{ delta, cvd }` alinhados às velas. Vela sem `buyVolume` fica com delta `null`, e o CVD repete o anterior.
- `chart/futuresPanes.js` → `createFuturesPanes(chart, wrap, handlers)` devolve `{ update(points, interval, data, liq, panes, volume), crosshair(idx), setVolumeAverages, setCvd, remove, active, count }`.
  - Ordem dos painéis (`subKeys`): volume (1, se ligado), CVD, RSI, MACD, liquidações e futuros. Os índices partem de `volCount()`, `cvdCount()`, `rsiCount()`, `macdCount()` e `liqCount()`.
  - Os de futuros são os últimos: quando entram ou saem, só eles são recriados (`createSeries(keys)`). `panes` é o subconjunto de `FUTURES_PANES` (`["oi", "ls", "funding"]`) ligado.
  - Quando muda um painel antes deles, `withFuturesMoved(fn)` tira os de futuros e os recoloca depois, com os dados que já tinham. Isso vale ao ligar ou desligar as liquidações.
  - Ligar ou desligar volume, CVD, RSI ou MACD, ou trocar CVD ↔ Delta, passa por `rebuildTop({ volume, cvd, rsi, macd })`. O estado atual vem de `topState()`, e só o que muda é passado. Dentro de `withFuturesMoved`, a função tira liquidações, MACD, RSI e CVD, ajusta volume, CVD, RSI e MACD e recoloca as liquidações.
  - No fim, `rebuildTop` redesenha na hora o CVD, o RSI e o MACD recriados (`drawCvd`, `drawRsi`, `drawMacd`): o `set…` desta renderização pode já ter passado.
  - `remove()` tira de baixo para cima.
  - O CVD só é recalculado quando mudam as velas; no Delta, também quando muda a opacidade.
  - `alignToBars(points, rows, get, mode)` encaixa as séries nas velas (`barIndex`, busca binária). Os modos são `last` (OI, L/S), `avg` (funding em D ou maior), `ffill` (funding em 1h/4h, repetindo a taxa vigente) e `sum` (liquidações).
  - Alturas: `PANE_HEIGHT = 96` px (ou a de `PANE_DEFAULT_HEIGHTS`: 150 px no RSI, 130 px no MACD) até a pessoa arrastar; depois vale `priceChartPaneHeights`. `applyHeights()` reaplica com `setStretchFactor` a cada resize.
  - Os títulos e spinners são HTML sobre o canvas, reposicionados por `ResizeObserver`.
- `createChart.update` define a variável CSS `--sub-panes` (quantidade de painéis), que aumenta a altura do gráfico.

## Casos de borda

- A Binance só guarda **30 dias** de OI e L/S. Em velas S/M, ou em períodos longos, esses painéis ficam vazios antes disso. O funding cobre cerca de 333 dias.
- Contratos em lote (`1000PEPE`): os valores são do contrato, enquanto o preço do gráfico é da moeda.

## Como verificar

1. Em BTC 4h, ligue "Open interest (futuros)": aparece 1 painel. Ligue "Taxa de funding (futuros)" e depois "Long/short ratio (futuros)": os painéis ficam na ordem OI, Long/Short, Funding. Desligue o do meio: os outros continuam.
2. Mova a mira: os títulos acompanham.
3. Arraste uma divisória e recarregue: a altura foi mantida.
4. Ligue "CVD / Delta de volume": o painel aparece logo abaixo do volume, antes dos de futuros. Na engrenagem dele, troque para "Delta por vela", mude a opacidade e a cor e passe a mira: o título acompanha.
5. Ligue o "RSI" e o "MACD": eles entram nessa ordem, entre o CVD e Liquidações (ver [rsi](rsi.md) e [macd](macd.md)).
6. Desligue "Volume" com CVD, OI e liquidações ligados: a ordem continua CVD, liquidações, OI. Com OI ligado, ligue e desligue "Liquidações": ela entra logo antes do OI, e o OI mantém os dados. Religue: o volume volta em primeiro, com as médias do volume.
7. Na engrenagem do volume, adicione uma média ("+ Média móvel"), edite e remova: o painel acompanha.
