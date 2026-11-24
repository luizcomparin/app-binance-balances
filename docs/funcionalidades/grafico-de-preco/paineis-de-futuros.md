---
titulo: Painéis abaixo do gráfico (volume, open interest, long/short, funding)
resumo: Painéis sincronizados com o eixo de tempo do preço: volume (sempre) e, cada um com seu checkbox, open interest, long/short e funding do contrato perpétuo; alturas ajustáveis e salvas.
arquivos: [server/services/futuresData.js, server/binance/futures.js, public/components/price-chart/chart/futuresPanes.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/chart/createChart.js]
rotas: [GET /futures-data/:asset]
eventos: []
storage: [priceChartFuturesOi, priceChartFuturesLs, priceChartFuturesFunding, priceChartFutures, priceChartPaneHeights]
---

# Painéis de volume e futuros

## O que faz

Os painéis ficam abaixo do preço, na mesma ordem do gráfico. Zoom, arrasto e mira são compartilhados.

1. **Volume** (USDT, spot). Aparece sempre que há velas: verde se a vela fechou em alta, vermelho se em baixa. Também recebe as médias do volume ([indicadores](indicadores.md)). Logo abaixo dele, quando ligado, vem o painel do indicador CVD/Delta ([indicadores](indicadores.md)).
2. **Open interest** (USDT), com a camada "Open interest (futuros)" (`#price-chart-fut-oi`).
3. **Long/Short** (camada "Long/short ratio (futuros)", `#price-chart-fut-ls`): % de contas compradas (amarelo) e de top traders comprados (azul), com uma linha em 50%.
4. **Funding** (camada "Taxa de funding (futuros)", `#price-chart-fut-funding`): histograma; o título mostra a taxa prevista para a próxima cobrança.
5. **Liquidações reais**, sempre por último (ver [liquidacoes-reais](liquidacoes-reais.md)).

Os três painéis de futuros são **independentes**: só os ligados aparecem, sempre nessa ordem, logo depois do volume. Os dados vêm de uma única chamada (`/futures-data`), feita quando ao menos um está ligado.

O título de cada painel mostra o valor na vela sob a mira (ou o mais recente), com uma explicação no hover (`FUTURES_HELP`). As divisórias entre painéis podem ser arrastadas, e as alturas ficam salvas.

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
- `chart/futuresPanes.js` → `createFuturesPanes(chart, wrap)` devolve `{ update(points, interval, data, liq, panes), crosshair(idx), setVolumeAverages, setCvd, remove, active, count }`. `panes` é o subconjunto de `FUTURES_PANES` (`["oi", "ls", "funding"]`) ligado; quando muda, os painéis de futuros são recriados (`createSeries(keys)`) e o de liquidações continua por último.
  - `alignToBars(points, rows, get, mode)` encaixa as séries nas velas (`barIndex`, busca binária). Os modos são `last` (OI, L/S), `avg` (funding em D ou maior), `ffill` (funding em 1h/4h, repetindo a taxa vigente) e `sum` (liquidações).
  - Alturas: `PANE_HEIGHT = 96` px até a pessoa arrastar; depois vale `priceChartPaneHeights`. `applyHeights()` reaplica com `setStretchFactor` a cada resize.
  - Os títulos e spinners são HTML sobre o canvas, reposicionados por `ResizeObserver`.
  - O painel de liquidações é recriado para continuar sendo o último quando os de futuros entram ou saem (`withLiquidationsMoved`).
- `createChart.update` define a variável CSS `--sub-panes` (quantidade de painéis), que aumenta a altura do gráfico.

## Casos de borda

- A Binance só guarda **30 dias** de OI e L/S. Em velas S/M, ou em períodos longos, esses painéis ficam vazios antes disso. O funding cobre cerca de 333 dias.
- Contratos em lote (`1000PEPE`): os valores são do contrato, enquanto o preço do gráfico é da moeda.

## Como verificar

1. Em BTC 4h, ligue "Open interest (futuros)": aparece 1 painel. Ligue "Taxa de funding (futuros)" e depois "Long/short ratio (futuros)": os painéis ficam na ordem OI, Long/Short, Funding. Desligue o do meio: os outros continuam.
2. Mova a mira: os títulos acompanham.
3. Arraste uma divisória e recarregue: a altura foi mantida.
