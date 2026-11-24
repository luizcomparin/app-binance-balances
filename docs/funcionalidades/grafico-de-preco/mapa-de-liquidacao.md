---
titulo: Mapa de liquidação estimado
resumo: Camada que estima, a partir de 30 dias de open interest e razões long/short dos futuros da Binance, onde ainda haveria liquidações; desenhada como mapa de calor + perfil à direita. Com a chave da Coinalyze, é calibrada pelas liquidações reais da Binance (valores e divisão por alavancagem). É estimativa, não dado real.
arquivos: [server/services/liquidationMap.js, server/services/liquidationModel.js, server/binance/futures.js, public/components/price-chart/chart/liquidationOverlay.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/PriceChartPanel.html, public/components/price-chart/PriceChartPanel.css, public/components/price-chart/paneSettings.js, public/components/price-chart/chart/createChart.js]
rotas: [GET /liquidation-map/:asset]
eventos: [COINALYZE_KEY_CHANGED]
storage: [priceChartLiquidation, priceChartLiqMapSettings]
---

# Mapa de liquidação estimado

## O que faz

Checkbox `#price-chart-liq`. A engrenagem no próprio checkbox (`#price-chart-liq-gear`) abre as opções logo abaixo dele, dentro das Camadas (`#price-chart-liq-settings`):

| Opção | Padrão | O que faz |
|---|---|---|
| Mostrar | Longs e shorts | Só longs (abaixo do preço) ou só shorts (acima), no mapa, no perfil e nos rótulos |
| Faixas já liquidadas (histórico) | ligado | Desligado: só os níveis ainda pendentes, sem o rastro do que já foi liquidado ou mudou |
| Esconder fracas | 6% | Faixas abaixo dessa fração do percentil 98 não são desenhadas (0 a 50%) |
| Opacidade | 100% | Transparência do mapa e do perfil (10 a 100%) |
| Cor fraca / Cor forte | roxo `#5032a0` / amarelo `#ffd200` | Escala do mapa de calor; a cor forte também pinta os rótulos |
| Perfil à direita | ligado | Barras do que está pendente na borda direita |
| Rótulos | 3 por lado | Valor das maiores concentrações acima e abaixo do preço: nenhum, 1, 3 ou 5 |

As opções valem para todas as moedas e ficam salvas em `priceChartLiqMapSettings`. Os padrões reproduzem o desenho de antes das opções.

- **Mapa de calor sobre o preço:** cada nível estimado é uma faixa horizontal, desde quando as posições foram abertas até o preço passar por ele (liquidadas) ou até agora. A cor vai de roxo apagado (pouco dinheiro) a amarelo forte (muito).
- **Perfil à direita:** o volume pendente por nível visível, com rótulos nas 3 maiores concentrações acima e abaixo do preço.
- **Caixa `#price-chart-liq-box`:**
  - o contrato e o multiplier;
  - a maior concentração de shorts acima e de longs abaixo;
  - a soma até ±10% e para que lado há mais liquidez;
  - a % de contas compradas e de top traders comprados;
  - com a chave da Coinalyze, o **ajuste pelas liquidações reais**: quanto o modelo previu e quanto foi liquidado de verdade (longs e shorts), o fator aplicado a cada lado e a correlação hora a hora. Sem a chave, uma linha diz o que falta;
  - com a chave, a **divisão por alavancagem** usada: a ajustada (com a padrão ao lado e o acerto fora do ajuste, antes → depois) ou a padrão, com o motivo de não ter trocado;
  - um aviso de **estimativa**.

> Ninguém publica onde estão as posições alavancadas. Para liquidações que **de fato** aconteceram, veja [liquidacoes-reais](liquidacoes-reais.md): o painel e a camada **Liquidações reais no gráfico** (checkbox próprio: perfil por preço, bolhas ou maiores eventos), que mostra se as faixas do mapa "pegaram" as cascatas.

## Server: o modelo (`services/liquidationMap.js` + `services/liquidationModel.js`)

`liquidationMap.js` busca os dados e converte os preços. A conta fica em `liquidationModel.js` (`runLiquidationModel`, `simulate`, `calibrate`, `fitLeverageTiers`, `tierScore`, `weightGrid`, `pearson`), que é pura e tem testes em `test/server/liquidationModel.test.js`.

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
   - correlação de Pearson, hora a hora, entre o total liquidado pelo modelo **já calibrado** (fator de cada lado aplicado) e o real.

   Resultado em `calibration` (ver [api.md](../../referencia/api.md#get-liquidation-mapasset)).

   **Ajuste da divisão por alavancagem** (`fitLeverageTiers`, antes da calibração). Atingir ou encolher um nível depende só do preço, do OI e das liquidações reais, nunca do peso. Por isso o liquidado por hora é linear nos pesos de `LEVERAGE_TIERS`:
   - roda `simulate` uma vez por alavancagem, com peso 1, e obtém a contribuição de cada uma em cada hora (há teste que confere essa linearidade);
   - testa as 1001 divisões de 10 em 10% (`weightGrid`). A nota de cada uma (`tierScore`) é a correlação hora a hora com o real, já com o fator real ÷ modelo de cada lado;
   - escolhe a melhor nos primeiros 2/3 das horas comparáveis e confere no último 1/3. Só troca a divisão padrão se acertar pelo menos 0,02 a mais nesse trecho de fora (`FIT_MIN_GAIN`). Se trocar, a divisão final é escolhida com todas as horas;
   - precisa de pelo menos 168 h comparáveis (`FIT_MIN_HOURS`), senão `reason: "few-hours"`.

   A simulação final roda com a divisão escolhida. O resultado vai em `leverage` (ver [api.md](../../referencia/api.md#get-liquidation-mapasset)). Na prática (nov/2026, BTC, ETH, SOL, XRP e DOGE), a padrão ficou: nenhuma outra acertou mais fora do ajuste, e no XRP a melhor do ajuste teria piorado de 0,82 para 0,65.
5. Os trechos do mapa de calor são "quebrados" quando o valor do nível muda mais de 25%. Trechos menores que 0,3% do maior não são enviados (o corte é feito antes da calibração).
6. Os preços são convertidos de contrato para moeda (`÷ multiplier`).

O formato da resposta está em [api.md](../../referencia/api.md#get-liquidation-mapasset). Cache: 5 min no server, separado com e sem chave da Coinalyze (`liqmap:<ASSET>:real` / `:est`).

## Página

- `PriceChartPanel.loadLiquidation(asset)` tem cache de 2 min por moeda (`liqCache`) e `renderLiq()` preenche a caixa (as linhas do ajuste vêm de `calibrationText()` e `leverageText()`). `COINALYZE_KEY_CHANGED` → `reloadLiquidations()` limpa o `liqCache` e recarrega o mapa. O `render()` passa `liquidation` só com `available`.
- `chart/liquidationOverlay.js` → `LiquidationOverlay`, um primitive anexado à série principal com `zOrder: "bottom"`. Recebe `timeToX(ms)` do `createChart`, que interpola dentro da vela porque o mapa é horário e o gráfico pode estar em D. A intensidade é normalizada pelo **percentil 98** dos trechos desenhados (depois dos filtros de lado e histórico), e abaixo de "Esconder fracas" a faixa não é desenhada. `setData(data, settings)` recebe as opções (`LIQ_MAP_DEFAULT` e `normalizeLiqMapSettings`, testadas em `test/public/liquidationOverlay.test.js`); o `render()` passa `liquidationSettings: getLiqMapSettings()`.
- O formulário da engrenagem é `paneSettings.mountLiqMapSettings` (os mesmos campos `data-k` das engrenagens de RSI e MACD). O botão fica dentro do `<label>` do checkbox, e o clique nele não marca nem desmarca a camada.
- Os rótulos de valor usam `formatUsdShort` (≈ "100,6M"), de `core/format.js`.

## Como verificar

1. Ligue a camada em BTC: aparece o mapa amarelado e o perfil à direita.
2. Numa moeda sem perpétuo, aparece a mensagem de indisponível.
3. Com a chave da Coinalyze, a caixa mostra "Ajustado com as liquidações reais da Binance" com os valores, os fatores e a correlação. Sem a chave, mostra a linha "Sem ajuste por liquidações reais: configure a chave...".
4. Com a chave, a caixa mostra a linha "Alavancagem": a divisão usada e o acerto fora do ajuste.
5. Salve ou remova a chave nas Configurações: o mapa recarrega e as linhas do ajuste mudam.
6. Ligue **Liquidações reais no gráfico** junto (estilo Perfil por preço ou Bolhas): as maiores concentrações reais devem cair perto das faixas amarelas que somem.
7. Clique na engrenagem do checkbox: as opções abrem logo abaixo, sem desligar o mapa. Escolha "Só shorts (acima)", desligue o histórico e suba "Esconder fracas": ficam só as faixas pendentes acima do preço. Recarregue a página: as opções continuam.
