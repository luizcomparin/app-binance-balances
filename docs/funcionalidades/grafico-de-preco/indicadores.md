---
titulo: Indicadores (médias móveis, Bollinger, média do volume, CVD/Delta)
resumo: Linha "Indicadores" do cabeçalho; vários indicadores com cor/opacidade/parâmetros, ocultar e remover; calculados no front sobre as velas carregadas, com velas de aquecimento.
arquivos: [public/components/price-chart/indicatorControls.js, public/components/price-chart/chart/movingAverage.js, public/components/price-chart/chart/bollinger.js, public/components/price-chart/chart/cvd.js, public/components/price-chart/chart/createChart.js, public/components/price-chart/chart/futuresPanes.js]
rotas: []
eventos: []
storage: [priceChartIndicators, priceChartMovingAverages, priceChartIndicatorsVisible]
---

# Indicadores

## O que faz

O botão "+ Adicionar" (em `#price-chart-mas`) oferece quatro tipos:

- **Média móvel** (SMA ou EMA) sobre o fechamento, desenhada no painel de preço.
- **Bandas de Bollinger:** média simples ± k desvios padrão (populacional, como no TradingView), com preenchimento entre as bandas.
- **Média móvel do volume**, desenhada no **painel de volume**.
- **CVD / Delta de volume**, num **painel próprio logo abaixo do volume**. Há no máximo um: depois de adicionado, some do menu. No editor, "Mostrar" escolhe entre:
  - **CVD (acumulado):** linha na cor escolhida.
  - **Delta por vela:** histograma verde/vermelho. A cor escolhida vale só para o valor do CVD no título.

  O título do painel mostra o CVD e o delta da vela sob a mira (ou da última), e a dica explica a leitura.
  - **Delta da vela** = compras agressivas (a mercado) − vendas agressivas = `2 × buyVolume − volume`, em USDT.
  - **CVD** = soma dos deltas desde a **primeira vela carregada**. Ao carregar histórico antigo, a linha inteira se desloca na vertical; só a direção importa.
  - O dado vem das próprias velas da Binance spot (o *taker buy* de `/api/v3/klines`): não usa chamada extra nem a Coinalyze.

Cada indicador vira uma pílula. Clicar no nome abre o editor (tipo, período 2–1000, desvios 0,5–5, opacidade, cor). Há também 👁 ocultar/exibir e × remover. Novas médias usam por padrão os períodos 20, 50, 100 e 200 ainda não usados e uma cor livre da paleta.

**Olho geral** (`.pcm-all`, no início da linha): exibe/oculta **todos** os indicadores (médias do preço, Bollinger e médias do volume) de uma vez. É uma regra por cima da exibição individual: não altera o `visible` de cada um. Desligado, `getIndicators()` devolve todos com `visible: false` e as pílulas ficam esmaecidas; ao religar, cada um volta ao seu estado. Fica salvo em `priceChartIndicatorsVisible`.

## Página

- `indicatorControls.js`:
  - `initIndicatorControls(container, { onChange })` e `getIndicators()` (lista, inclusive os ocultos).
  - Formato de cada item: `{ id, kind: "ma"|"vma"|"bb"|"cvd", period, type?, mult?, color "#rrggbb", opacity, visible }`, normalizado por `normalize()`. No `cvd`, `type` é `"CVD"|"DELTA"` e `period` não se aplica (fica fora do aquecimento, em `maxMaPeriod`).
  - `onChange` → `PriceChartPanel`: `render()` + `ensureWarmup()`, que carrega histórico se faltarem velas para a média.
  - O seletor de cor nativo tem um tratamento especial para não reabrir no mesmo clique (`dataset.open`).
- `chart/movingAverage.js`:
  - `movingAverage(points, period, type, field)`: o resultado fica alinhado às velas, com `null` no aquecimento. A EMA começa pela SMA das primeiras `period` velas.
  - `maColor({ color, opacity })` → `rgba`. `maLabel` → `"SMA 20"`.
- `chart/bollinger.js`: `bollinger(points, period, mult)` → `{ basis, upper, lower }`. A classe `BandFill` é um primitive do Lightweight Charts que preenche entre as duas curvas, porque a biblioteca não tem esse recurso.
- `createChart.drawIndicators()` cria, atualiza e remove as séries por `id`. Só recalcula quando mudam as velas ou os parâmetros (`key`). Ao trocar Linha/Velas, os indicadores são recriados por cima da nova série.
- `futuresPanes.setVolumeAverages(list)` desenha as médias do volume no painel 1, e os valores aparecem no título do painel de volume.
- `chart/cvd.js` → `volumeDelta(points)` → `{ delta, cvd }`, alinhados às velas. Vela sem `buyVolume` fica com delta `null`, e o CVD repete o valor anterior.
- `futuresPanes.setCvd(m | null)` cria o painel de CVD logo depois do volume. Quando ele entra, sai ou troca de CVD para Delta, `rebuildCvd` tira e recoloca depois dele os painéis de futuros e o de liquidações, com os dados que já tinham. Os dados só são recalculados quando mudam as velas (no Delta, também a opacidade).

## Persistência

`priceChartIndicators` (JSON). A chave legada `priceChartMovingAverages` é lida se a nova não existir e apagada no primeiro save.

## Casos de borda

- Período maior que o número de velas disponíveis: a linha fica vazia até carregar o histórico. `MAX_PERIOD = 1000` equivale a uma página de aquecimento.
- Os indicadores usam as velas da **vela atual** (uma SMA 20 em D é diferente de uma SMA 20 em 4h).

## Como verificar

1. Adicione SMA 200 em D com período de 1 ano: a linha já começa preenchida (aquecimento).
2. Troque para EMA.
3. Adicione BB e mude σ.
4. Adicione uma média do volume: ela aparece no painel de volume.
5. Recarregue: tudo persiste.
6. Adicione "CVD / Delta de volume": o painel aparece logo abaixo do volume, antes dos de futuros. Troque para "Delta por vela" e passe a mira: o título acompanha. Ligue e desligue OI e liquidações: o CVD continua logo abaixo do volume.
7. Oculte um indicador pelo seu olho e depois clique no olho geral: todos somem. Clique de novo: voltam todos, menos o que estava oculto individualmente.
