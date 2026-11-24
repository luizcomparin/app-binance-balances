---
titulo: Indicadores (médias móveis e Bollinger; médias do volume)
resumo: Linha "Indicadores" do cabeçalho (médias móveis e Bollinger do preço) e a mesma lista de pílulas para as médias do volume, na engrenagem do painel de Volume; cor/opacidade/parâmetros, ocultar e remover; calculados no front sobre as velas carregadas, com velas de aquecimento.
arquivos: [public/components/price-chart/indicatorControls.js, public/components/price-chart/chart/movingAverage.js, public/components/price-chart/chart/bollinger.js, public/components/price-chart/chart/createChart.js, public/components/price-chart/chart/futuresPanes.js]
rotas: []
eventos: []
storage: [priceChartIndicators, priceChartMovingAverages, priceChartIndicatorsVisible, priceChartVolumeAverages]
---

# Indicadores

## O que faz

O botão "+ Adicionar" (em `#price-chart-mas`) oferece dois tipos:

- **Média móvel** (SMA ou EMA) sobre o fechamento, desenhada no painel de preço.
- **Bandas de Bollinger:** média simples ± k desvios padrão (populacional, como no TradingView), com preenchimento entre as bandas.

As **médias móveis do volume** usam a mesma lista de pílulas, mas ficam na **engrenagem do título do painel de Volume** ("+ Média móvel"), e são desenhadas nesse painel. O CVD/Delta é um painel das Camadas, configurado pela engrenagem dele. Os dois estão em [paineis-de-futuros](paineis-de-futuros.md).

Cada indicador vira uma pílula. Clicar no nome abre o editor (tipo, período 2–1000, desvios 0,5–5, opacidade, cor). Há também 👁 ocultar/exibir e × remover. Novas médias usam por padrão os períodos 20, 50, 100 e 200 ainda não usados e uma cor livre da paleta.

**Olho geral** (`.pcm-all`, no início da linha): exibe/oculta **todos** os indicadores do preço (médias e Bollinger) de uma vez. As médias do volume não entram: elas somem junto com o painel de Volume. É uma regra por cima da exibição individual: não altera o `visible` de cada um. Desligado, `getIndicators()` devolve todos com `visible: false` e as pílulas ficam esmaecidas; ao religar, cada um volta ao seu estado. Fica salvo em `priceChartIndicatorsVisible`.

## Página

- `indicatorControls.js`:
  - `createIndicatorList({ kinds, storageKey, legacy?, legacyKey?, allVisibleKey?, addLabel? })` → `{ get(), mount(container, onChange) }`: uma lista de pílulas. Há duas instâncias:
    - a do preço (`ma`, `bb`), com olho geral: `initIndicatorControls(container, { onChange })` e `getIndicators()`;
    - a do volume (`vma`): `initVolumeAverageControls(container, { onChange })` (chamada por `paneSettings.js`) e `getVolumeAverages()`.
  - Sem lista salva, uma instância herda a antiga (`legacy`) e já a grava na chave nova.
  - `handleColorClick` e `watchColorPickerClose` tratam o seletor de cor nativo, e `paneSettings.js` também os usa.
  - Formato de cada item: `{ id, kind: "ma"|"vma"|"bb", period, type?, mult?, color "#rrggbb", opacity, visible }`, normalizado por `normalize()`. O aquecimento (`maxMaPeriod`) considera também as médias do volume, quando o painel de Volume está ligado.
  - `onChange` → `PriceChartPanel`: `render()` + `ensureWarmup()`, que carrega histórico se faltarem velas para a média.
  - O seletor de cor nativo tem um tratamento especial para não reabrir no mesmo clique (`dataset.open`).
- `chart/movingAverage.js`:
  - `movingAverage(points, period, type, field)`: o resultado fica alinhado às velas, com `null` no aquecimento. A EMA começa pela SMA das primeiras `period` velas.
  - `maColor({ color, opacity })` → `rgba`. `maLabel` → `"SMA 20"`.
- `chart/bollinger.js`: `bollinger(points, period, mult)` → `{ basis, upper, lower }`. A classe `BandFill` é um primitive do Lightweight Charts que preenche entre as duas curvas, porque a biblioteca não tem esse recurso.
- `createChart.drawIndicators()` cria, atualiza e remove as séries por `id`. Só recalcula quando mudam as velas ou os parâmetros (`key`). Ao trocar Linha/Velas, os indicadores são recriados por cima da nova série.
- `futuresPanes.setVolumeAverages(list)` desenha as médias do volume no painel 1, e os valores aparecem no título do painel de volume.

## Persistência

`priceChartIndicators` (JSON, médias e Bollinger do preço). A chave legada `priceChartMovingAverages` é lida se a nova não existir e apagada no primeiro save. As médias do volume ficam em `priceChartVolumeAverages`. Na primeira carga, elas são copiadas dos itens `vma` que ainda estiverem em `priceChartIndicators`.

## Casos de borda

- Período maior que o número de velas disponíveis: a linha fica vazia até carregar o histórico. `MAX_PERIOD = 1000` equivale a uma página de aquecimento.
- Os indicadores usam as velas da **vela atual** (uma SMA 20 em D é diferente de uma SMA 20 em 4h).

## Como verificar

1. Adicione SMA 200 em D com período de 1 ano: a linha já começa preenchida (aquecimento).
2. Troque para EMA.
3. Adicione BB e mude σ.
4. Na engrenagem do painel de Volume, clique em "+ Média móvel": ela aparece no painel de volume.
5. Recarregue: tudo persiste.
6. Oculte um indicador pelo seu olho e depois clique no olho geral: todos somem. Clique de novo: voltam todos, menos o que estava oculto individualmente.
