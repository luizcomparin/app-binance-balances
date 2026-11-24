---
titulo: Velas, período e tamanho de vela
resumo: /price-chart devolve velas OHLC+volume em USDT; o front combina período (janela) e tamanho da vela como no TradingView, pagina até 3000 velas, carrega histórico antigo ao arrastar e converte fuso.
arquivos: [server/services/priceChart.js, public/components/price-chart/timeframe.js, public/components/price-chart/chartData.js, public/components/price-chart/chart/axis.js, public/components/price-chart/chart/createChart.js, public/components/price-chart/PriceChartPanel.js]
rotas: [GET /price-chart/:asset]
eventos: []
storage: [priceChartMode, priceChartRange, priceChartInterval]
---

# Velas, período e tamanho de vela

## O que faz

- **Linha | Velas** (`#price-chart-mode`): troca só o desenho, sem nova requisição.
- **Tamanho da vela** (`#price-chart-interval`: 1h · 4h · D · S · M): redesenha **mantendo a janela de tempo** que está na tela.
- **Período** (`#price-chart-ranges`: 7d · 30d · 90d · 6 meses · 1 ano · 2 anos · Tudo · Personalizado `<n>` dias/meses/anos): mostra essa janela e escolhe a vela recomendada.
- **Ajustar zoom** (`#price-chart-fit`): enquadra todo o período carregado e volta a escala de preço para automática.
- **Arrastar para o passado:** ao chegar perto do início dos dados, a página anterior de velas é carregada.
- O resumo no canto do gráfico mostra, por exemplo, "BTC/USDT · Diário · 1 ano".

## Server

`GET /price-chart/:asset` → `services/priceChart.js` `buildPriceChart(asset, { range, interval, limit, before })`:

- Escolhe o símbolo `<asset>USDT`. Se não existir, usa `USDT<asset>` (**invertido**: `1/preço`, com máxima e mínima trocadas). Se nenhum existir, lança `"Não existe par X/USDT na Binance"`.
- Com `interval` explícito (o caso usado pelo front): `/api/v3/klines?symbol&interval&limit&endTime=before-1`.
- Modo compatível por `range`: `CHART_RANGES` (`7d, 30d, 90d, 1y, all`) ou personalizado `<n>[dmy]`, com até cerca de 500 pontos. Com `before`, 500 por página.
- Volume em USDT: `k[7]` (volume na moeda de cotação) ou, no par invertido, `k[5]`.
- `buyVolume` (compras agressivas, em USDT, para o CVD/Delta): `k[10]` (*taker buy* na cotação) ou, no par invertido, `volume − k[9]`.
- Cache de 60 s por `símbolo:intervalo:limite:before`.

## Página

### Regras período × vela (`timeframe.js`, funções puras)

- `rangeDays(range)`: presets (`6m` = 182, `all` = ∞) ou `<n>d|m|y` (m = 30, y = 365 dias).
- `recommendedInterval(days)`: a menor vela entre 1h/4h/1d/1w que deixa a janela com até cerca de 500 velas. `all` → 1w.
- `fitInterval(interval, fromMs)`: **sobe** a vela enquanto a janela pedir mais de `MAX_CANDLES = 3000` (3 páginas). O "Tudo" conta a partir de jul/2017 (início da Binance).
- `clampWindow(win, interval)`: com a vela escolhida pela pessoa, **encurta** a janela para caber em 3000 velas.
- `rangeWindow(range)` → `{ fromMs, toMs: null }`. `fromMs = 0` significa tudo.

### Carga (`PriceChartPanel.loadChart`)

1. `requestId++`. A janela vem de `rangeWindow(range)` ou, com `keepWindow`, de `chart.getVisibleWindow()` passada por `clampWindow`. Sem `keepWindow`, a vela pode subir via `fitInterval` (e é salva).
2. Loop: `getKlines(asset, interval, before)`, páginas de **1000**, de trás para frente, até cobrir `win.fromMs − aquecimento` (o maior período de média móvel visível × duração da vela) ou atingir `MAX_CANDLES + aquecimento`. Uma página incompleta significa o início do histórico (`reachedStart`).
3. `render({ window })` → `createChart.showWindow()` (`setVisibleRange` reaplicado no frame seguinte, porque a biblioteca pode desfazer).

### Histórico sob demanda (`loadOlder`)

- `createChart` assina `subscribeVisibleLogicalRangeChange`. Se a janela anda **para trás**, **por interação da pessoa** (até 1 s depois de pointer, wheel ou touch) e `range.from < 10`, chama `onNeedOlder` → `loadOlder()`.
- `loadOlder` busca a página anterior a `points[0].time` e chama `render({ prepended: n })`. O gráfico desloca o range lógico em `n` para não "pular".
- `ensureWarmup()`: ao adicionar ou aumentar uma média móvel, carrega mais histórico se faltarem velas antes da janela.

### Cache (`chartData.getKlines`)

Chave `asset|interval|before`. A página mais recente vale 60 s; as páginas antigas, 10 min. Trocar Linha/Velas nunca refaz a requisição.

### Tempo e fuso (`chart/axis.js`)

- O Lightweight Charts exibe o tempo como UTC. Velas **intradiárias** (1h/4h) são deslocadas pelo fuso local (`toChartTime`) para mostrar a hora local. Diárias e maiores seguem o dia UTC, como na Binance.
- `fromChartTime` é o inverso (aproximado).
- `priceFormatFor(price)` define a precisão do eixo pela grandeza do preço (BTC 2 casas, PEPE 8+). `formatAxisPrice` arredonda para evitar resíduos de ponto flutuante.

## Persistência

`priceChartMode`, `priceChartRange` (validado por `VALID_RANGE`) e `priceChartInterval` (validado por `VALID_INTERVALS`). Sem nada salvo, o padrão é **D + 1 ano**.

## Casos de borda

- `CHART_RANGES` do server não tem `6m`/`2y`, mas o front sempre manda `interval`, então isso não importa.
- Moeda recém-listada: menos de uma página → `reachedStart` na primeira carga.
- Erro de carga: `#price-chart-error` com a mensagem, e o gráfico é limpo.

## Como verificar

1. Período "Tudo": a vela vira S.
2. Escolha 1h com "Tudo": a janela encurta para cerca de 125 dias.
3. Arraste para a esquerda: uma borda de carregamento aparece e mais velas chegam.
4. Em 1h, a hora do tooltip deve ser local.
