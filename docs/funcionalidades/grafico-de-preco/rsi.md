---
titulo: Camada RSI (Índice de Força Relativa)
resumo: Painel abaixo do gráfico com o RSI do fechamento (suavização de Wilder, como no TradingView), escala fixa de 0 a 100, linhas de sobrecompra/sobrevenda e engrenagem para período, níveis, cor e opacidade.
arquivos: [public/components/price-chart/chart/rsi.js]
rotas: []
eventos: []
storage: [priceChartRsiPane, priceChartRsi]
---

# RSI

## O que faz

O checkbox "RSI" (`#price-chart-rsi-pane`), em "Painéis abaixo do gráfico" nas Camadas, liga um painel com o **RSI** das velas do gráfico. Ele vem depois do Volume e do CVD e antes de Liquidações e dos painéis de futuros, na ordem dos checkboxes.

- **Linha do RSI** na cor escolhida, com escala fixa de 0 a 100.
- **Linhas tracejadas** de sobrecompra (vermelha, padrão 70) e de sobrevenda (verde, padrão 30), e uma pontilhada em 50.
- **Título:** "RSI 14" com o valor da vela sob a mira (ou da última). Quando o valor passa dos níveis, aparece "sobrecomprado" ou "sobrevendido". A dica do título explica a leitura (`FUTURES_HELP.rsi`).
- **Engrenagem** logo à direita do nome. Abre as configurações:
  - período (2–100, padrão 14);
  - sobrecompra (51–99, padrão 70);
  - sobrevenda (1–49, padrão 30);
  - opacidade e cor da linha.

## Página (front)

- `chart/rsi.js`:
  - `rsi(points, period)`: o RSI alinhado às velas, com `null` nas primeiras `period` velas.
  - `normalizeRsiSettings(c)`: coloca as configurações nos limites; valores inválidos voltam ao padrão (`RSI_DEFAULT`).
- `paneSettings.js`: `getRsiSettings()` e `mountRsi`, a caixa da engrenagem. Os números valem ao confirmar (Enter ou sair do campo); cor e opacidade mudam enquanto se escolhe.
- `PriceChartPanel.js`: flag `view.showRsi` (`priceChartRsiPane`). `render()` envia `rsi: getRsiSettings()` ou `null`.
- `chart/createChart.js`: conta o painel em `--sub-panes` e chama `futures.setRsi(rsi)`.
- `chart/futuresPanes.js`:
  - `createRsiSeries` cria uma `LineSeries` com `autoscaleInfoProvider` fixo em 0–100.
  - `setRsi(m)` liga e desliga o painel por `rebuildTop` (ver [paineis-de-futuros](paineis-de-futuros.md)). `drawRsi` desenha.
  - Os dados só são recalculados quando mudam as velas ou o período, e as linhas só quando mudam os níveis.

## Regras de negócio e fórmulas

- Variação de cada vela: `fechamento − fechamento anterior`. As altas e as baixas (em módulo) são suavizadas pela média de Wilder (RMA):
  - começa pela média simples das primeiras `period` variações;
  - depois, `média = (média anterior × (period − 1) + valor) / period`.
- `RSI = 100 − 100 / (1 + média das altas / média das baixas)`. Sem baixas, o RSI é 100; sem altas, 0. Velas sem nenhuma variação também dão 100, como no TradingView.
- **Aquecimento:** `maxMaPeriod()` pede **4 × o período** de velas antes da janela visível (`ensureWarmup`). A média de Wilder demora para esquecer o começo; com essa folga, o valor fica igual ao do TradingView.

## Cache e estado persistido

- `priceChartRsiPane`: `"1"` ou `"0"`, desligado por padrão.
- `priceChartRsi`: JSON `{ period, overbought, oversold, color, opacity }`.

## Casos de borda e armadilhas

- Com menos de `period + 1` velas, o painel fica vazio.
- O RSI usa as velas da **vela atual**: um RSI 14 em D é diferente de um em 4h.
- Em par invertido (`USDT<moeda>`), o fechamento já vem invertido, então o RSI é o da moeda em USDT.

## Checklist ao alterar

- Mudou a fórmula: ajuste `test/public/rsi.test.js`.
- Mudou um limite: ajuste `normalizeRsiSettings`, os `min`/`max` dos campos em `paneSettings.js` e este doc.

## Como verificar

1. Em BTC D, ligue "RSI": o painel aparece logo abaixo do CVD (ou do Volume), antes de Liquidações, com linhas em 70, 50 e 30. Compare o valor com o RSI 14 do TradingView na mesma vela.
2. Na engrenagem, mude o período para 7 e os níveis para 80/20: a linha e as tracejadas acompanham, e o título vira "RSI 7".
3. Mude a cor e a opacidade e passe a mira: aparece "sobrecomprado" ou "sobrevendido" nas velas além dos níveis.
4. Com CVD e OI ligados, desligue e religue o RSI e o Volume: a ordem continua a das Camadas, e nenhum painel fica vazio.
5. Recarregue: o painel e as configurações persistem.
