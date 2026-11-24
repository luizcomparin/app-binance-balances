---
titulo: Mapa de liquidação estimado
resumo: Camada que estima, a partir de 30 dias de open interest e razões long/short dos futuros da Binance, onde ainda haveria liquidações; desenhada como mapa de calor + perfil à direita. Com a chave da Coinalyze, é calibrada pelas liquidações reais da Binance. É estimativa, não dado real.
arquivos: [server/services/liquidationMap.js, server/services/liquidationModel.js, server/binance/futures.js, public/components/price-chart/chart/liquidationOverlay.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/chart/createChart.js]
rotas: [GET /liquidation-map/:asset]
eventos: [COINALYZE_KEY_CHANGED]
storage: [priceChartLiquidation]
---

# Mapa de liquidação estimado

## O que faz

Checkbox `#price-chart-liq`.

- **Mapa de calor sobre o preço:** cada nível estimado é uma faixa horizontal, desde quando as posições foram abertas até o preço passar por ele (liquidadas) ou até agora. A cor vai de roxo apagado (pouco dinheiro) a amarelo forte (muito).
- **Perfil à direita:** o volume pendente por nível visível, com rótulos nas 3 maiores concentrações acima e abaixo do preço.
- **Caixa `#price-chart-liq-box`:**
  - o contrato e o multiplier;
  - a maior concentração de shorts acima e de longs abaixo;
  - a soma até ±10% e para que lado há mais liquidez;
  - a % de contas compradas e de top traders comprados;
  - com a chave da Coinalyze, o **ajuste pelas liquidações reais**: quanto o modelo previu e quanto foi liquidado de verdade (longs e shorts), o fator aplicado a cada lado e a correlação hora a hora. Sem a chave, uma linha diz o que falta;
  - um aviso de **estimativa**.

> Ninguém publica onde estão as posições alavancadas. Para liquidações que **de fato** aconteceram, veja [liquidacoes-reais](liquidacoes-reais.md): o painel e as **bolhas sobre o gráfico** (checkbox próprio), que mostram se as faixas do mapa "pegaram" as cascatas.

## Server: o modelo (`services/liquidationMap.js` + `services/liquidationModel.js`)

`liquidationMap.js` busca os dados e converte os preços. A conta fica em `liquidationModel.js` (`runLiquidationModel`, `calibrate`, `pearson`), que é pura e tem testes em `test/server/liquidationModel.test.js`.

1. `getPerpetualFor(asset)` resolve o contrato perpétuo USDT e o `multiplier`. Sem contrato: `{ available: false, reason: "no-perpetual" }`.
2. Busca em paralelo 721 velas de 1h dos futuros e as séries horárias de 30 dias de `openInterestHist`, `globalLongShortAccountRatio` e `topLongShortPositionRatio`. Sem OI suficiente: `reason: "no-data"`.
   Com a chave da Coinalyze, busca também as liquidações reais em 1h (`buildLiquidations(asset, "1h")`, mesma resposta e mesmo cache do painel de liquidações) e usa só a parte da **Binance** (`by.Binance`), porque o open interest do modelo é só da Binance. Se a Coinalyze falhar, o mapa sai sem ajuste.
3. Para cada hora:
   - **(5)** Os níveis cujo preço foi atingido (mínima ≤ nível long, máxima ≥ nível short) foram liquidados e saem do mapa.
   - **(4)** Se o OI caiu, todos os níveis encolhem na proporção `qtyAfter/qtyBefore`. Com liquidações reais, a parte da queda que foi liquidação (US$ liquidados ÷ preço típico, em contratos) não conta, porque esses níveis já saíram no passo 5: a proporção vira `min(1, (qtyAfter + liquidados) / qtyBefore)`, e só o fechamento voluntário encolhe os outros níveis.
   - **(1–3)** Se o OI subiu, o notional novo = ΔOI × preço típico. Cada contrato tem um long e um short. A fração long é `0,4·contas + 0,3·top traders + 0,3·volume agressor de compra`. A divisão por alavancagem é `LEVERAGE_TIERS` (5x 10%, 10x 30%, 25x 30%, 50x 20%, 100x 10%), e o preço de liquidação é `P·(1 ∓ (1/alav − 0,005))`, agrupado em faixas de 0,25% do preço atual.
4. **Calibração** (com liquidações reais): para cada hora, o modelo soma o valor dos níveis atingidos no passo 5 (o que ele "acha" que foi liquidado) e compara com o real da Binance. As primeiras 72 h ficam de fora (`CALIBRATION_WARMUP_HOURS`: o modelo ainda não conhece as posições abertas antes da janela), e dentro do período coberto a hora sem linha da Coinalyze vale 0. Com pelo menos 24 h comparáveis:
   - fator por lado = real ÷ modelo, limitado a 0,05–20 (`null` se um dos dois for zero: aquele lado fica sem ajuste);
   - os níveis pendentes e os trechos do mapa de calor daquele lado são multiplicados pelo fator;
   - correlação de Pearson, hora a hora, entre o total liquidado pelo modelo e o real.

   Resultado em `calibration` (ver [api.md](../../referencia/api.md#get-liquidation-mapasset)).
5. Os trechos do mapa de calor são "quebrados" quando o valor do nível muda mais de 25%. Trechos menores que 0,3% do maior não são enviados (o corte é feito antes da calibração).
6. Os preços são convertidos de contrato para moeda (`÷ multiplier`).

O formato da resposta está em [api.md](../../referencia/api.md#get-liquidation-mapasset). Cache: 5 min no server, separado com e sem chave da Coinalyze (`liqmap:<ASSET>:real` / `:est`).

## Página

- `PriceChartPanel.loadLiquidation(asset)` tem cache de 2 min por moeda (`liqCache`) e `renderLiq()` preenche a caixa (a linha do ajuste vem de `calibrationText()`). `COINALYZE_KEY_CHANGED` → `reloadLiquidations()` limpa o `liqCache` e recarrega o mapa. O `render()` passa `liquidation` só com `available`.
- `chart/liquidationOverlay.js` → `LiquidationOverlay`, um primitive anexado à série principal com `zOrder: "bottom"`. Recebe `timeToX(ms)` do `createChart`, que interpola dentro da vela porque o mapa é horário e o gráfico pode estar em D. A intensidade é normalizada pelo **percentil 98**, e abaixo de 6% a faixa não é desenhada.
- Os rótulos de valor usam `formatUsdShort` (≈ "100,6M"), de `core/format.js`.

## Como verificar

1. Ligue a camada em BTC: aparece o mapa amarelado e o perfil à direita.
2. Numa moeda sem perpétuo, aparece a mensagem de indisponível.
3. Com a chave da Coinalyze, a caixa mostra "Ajustado com as liquidações reais da Binance" com os valores, os fatores e a correlação. Sem a chave, mostra a linha "Sem ajuste por liquidações reais: configure a chave...".
4. Salve ou remova a chave nas Configurações: o mapa recarrega e a linha do ajuste muda.
5. Ligue as **Bolhas de liquidações (reais)** junto: as bolhas grandes devem cair perto das faixas amarelas que somem.
