---
titulo: Mapa de liquidação estimado
resumo: Camada que estima, a partir de 30 dias de open interest e razões long/short dos futuros da Binance, onde ainda haveria liquidações; desenhada como mapa de calor + perfil à direita. É estimativa, não dado real.
arquivos: [server/services/liquidationMap.js, server/binance/futures.js, public/components/price-chart/chart/liquidationOverlay.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/chart/createChart.js]
rotas: [GET /liquidation-map/:asset]
eventos: []
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
  - um aviso de **estimativa**.

> Ninguém publica onde estão as posições alavancadas. Para liquidações que **de fato** aconteceram, veja [liquidacoes-reais](liquidacoes-reais.md).

## Server: o modelo (`services/liquidationMap.js`)

1. `getPerpetualFor(asset)` resolve o contrato perpétuo USDT e o `multiplier`. Sem contrato: `{ available: false, reason: "no-perpetual" }`.
2. Busca em paralelo 721 velas de 1h dos futuros e as séries horárias de 30 dias de `openInterestHist`, `globalLongShortAccountRatio` e `topLongShortPositionRatio`. Sem OI suficiente: `reason: "no-data"`.
3. Para cada hora:
   - **(5)** Os níveis cujo preço foi atingido (mínima ≤ nível long, máxima ≥ nível short) foram liquidados e saem do mapa.
   - **(4)** Se o OI caiu, todos os níveis encolhem na proporção `qtyAfter/qtyBefore`.
   - **(1–3)** Se o OI subiu, o notional novo = ΔOI × preço típico. Cada contrato tem um long e um short. A fração long é `0,4·contas + 0,3·top traders + 0,3·volume agressor de compra`. A divisão por alavancagem é `LEVERAGE_TIERS` (5x 10%, 10x 30%, 25x 30%, 50x 20%, 100x 10%), e o preço de liquidação é `P·(1 ∓ (1/alav − 0,005))`, agrupado em faixas de 0,25% do preço atual.
4. Os trechos do mapa de calor são "quebrados" quando o valor do nível muda mais de 25%. Trechos menores que 0,3% do maior não são enviados.
5. Os preços são convertidos de contrato para moeda (`÷ multiplier`).

O formato da resposta está em [api.md](../../referencia/api.md#get-liquidation-mapasset). Cache: 5 min no server.

## Página

- `PriceChartPanel.loadLiquidation(asset)` tem cache de 2 min por moeda (`liqCache`) e `renderLiq()` preenche a caixa. O `render()` passa `liquidation` só com `available`.
- `chart/liquidationOverlay.js` → `LiquidationOverlay`, um primitive anexado à série principal com `zOrder: "bottom"`. Recebe `timeToX(ms)` do `createChart`, que interpola dentro da vela porque o mapa é horário e o gráfico pode estar em D. A intensidade é normalizada pelo **percentil 98**, e abaixo de 6% a faixa não é desenhada.
- Os rótulos de valor usam `formatUsdShort` (≈ "100,6M"), de `core/format.js`.

## Como verificar

1. Ligue a camada em BTC: aparece o mapa amarelado e o perfil à direita.
2. Numa moeda sem perpétuo, aparece a mensagem de indisponível.
