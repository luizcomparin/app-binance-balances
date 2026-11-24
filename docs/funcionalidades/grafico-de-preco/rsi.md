---
titulo: Camada RSI (Índice de Força Relativa)
resumo: Painel abaixo do gráfico com o RSI do fechamento (suavização de Wilder, como no TradingView), escala ajustada aos valores visíveis (sempre com as linhas de nível), média móvel opcional e linhas de sobrecompra/sobrevenda configuráveis pela engrenagem.
arquivos: [public/components/price-chart/chart/rsi.js]
rotas: []
eventos: []
storage: [priceChartRsiPane, priceChartRsi]
---

# RSI

## O que faz

O checkbox "RSI" (`#price-chart-rsi-pane`), em "Painéis abaixo do gráfico" nas Camadas, liga um painel com o **RSI** das velas do gráfico. Ele vem depois do Volume e do CVD e antes de Liquidações e dos painéis de futuros, na ordem dos checkboxes.

- **Linha do RSI** na cor escolhida. A escala acompanha os valores visíveis (zoom vertical), sempre incluindo as linhas de sobrecompra e sobrevenda e dentro de 0–100, com margens pequenas. Assim a linha usa a altura do painel, em vez de ficar espremida no meio. O painel começa com **150 px** de altura (os outros, 96), porque o oscilador precisa de espaço vertical. Dá para arrastar a divisória, e a altura fica salva.
- **Média móvel do RSI** (opcional): SMA ou EMA dos valores do RSI, no mesmo painel e na mesma escala.
- **Linhas de nível:** sobrecompra (padrão 70, vermelha) e sobrevenda (padrão 30, verde), tracejadas por padrão, e uma pontilhada em 50.
- **Título:** "RSI 14", o valor da vela sob a mira (ou da última) e, com a média ligada, "SMA 14 …" na cor dela. Quando o valor passa dos níveis, aparece "sobrecomprado" ou "sobrevendido". A dica do título explica a leitura (`FUTURES_HELP.rsi`).
- **Engrenagem** logo à direita do nome. A caixa rola se não couber:

| Seção | Configuração | Faixa | Padrão |
|---|---|---|---|
| RSI | Período | 2–100 | 14 |
| RSI | Opacidade e cor da linha | — | 100%, roxo |
| Média móvel do RSI | Mostrar | — | desligada |
| Média móvel do RSI | Tipo | SMA/EMA | SMA |
| Média móvel do RSI | Período | 2–100 | 14 |
| Média móvel do RSI | Cor | — | amarelo |
| Linhas de nível | Sobrecompra (nível e cor) | 51–99 | 70, vermelho |
| Linhas de nível | Sobrevenda (nível e cor) | 1–49 | 30, verde |
| Linhas de nível | Estilo | tracejada, pontilhada, sólida | tracejada |
| Linhas de nível | Espessura | 1–4 px | 1 px |
| Linhas de nível | Opacidade | — | 60% |
| Linhas de nível | Linha do meio (50) | — | ligada |

## Página (front)

- `chart/rsi.js`:
  - `rsi(points, period)`: o RSI alinhado às velas, com `null` nas primeiras `period` velas.
  - `rsiMovingAverage(values, period, type)`: a média móvel do RSI. Usa `movingAverage` a partir do primeiro valor não nulo do RSI.
  - `normalizeRsiSettings(c)`: coloca as configurações nos limites; valores inválidos voltam ao padrão (`RSI_DEFAULT`).
- `paneSettings.js`: `getRsiSettings()` e `mountRsi`, a caixa da engrenagem (`.fp-settings-rsi`).
  - Cada controle tem `data-k` com a chave da configuração.
  - Números valem ao confirmar (Enter ou sair do campo); selects e checkboxes, ao mudar; cores e opacidades, enquanto se escolhe.
- `PriceChartPanel.js`: flag `view.showRsi` (`priceChartRsiPane`). `render()` envia `rsi: getRsiSettings()` ou `null`.
- `chart/createChart.js`: conta o painel como 1,5 em `--sub-panes` (pela altura maior) e chama `futures.setRsi(rsi)`.
- `chart/futuresPanes.js`:
  - `createRsiSeries` cria uma `LineSeries` com `autoscaleInfoProvider`: a faixa automática dos valores visíveis, estendida até os níveis de `st.rsiM` e limitada a 0–100. As margens da escala do painel são de 6% (`scaleMargins`). A média do RSI usa as mesmas opções.
  - `setRsi(m)` liga e desliga o painel por `rebuildTop` (ver [paineis-de-futuros](paineis-de-futuros.md)).
  - `drawRsi` desenha a linha e as linhas de nível (`createPriceLine`), refeitas só quando muda um nível ou a aparência.
  - `drawRsiMa` cria ou remove a série da média no mesmo painel e só a recalcula quando muda o RSI, o tipo ou o período.
  - `PANE_DEFAULT_HEIGHTS.rsi = 150` é a altura padrão; vale até a pessoa arrastar a divisória.

## Regras de negócio e fórmulas

- Variação de cada vela: `fechamento − fechamento anterior`. As altas e as baixas (em módulo) são suavizadas pela média de Wilder (RMA):
  - começa pela média simples das primeiras `period` variações;
  - depois, `média = (média anterior × (period − 1) + valor) / period`.
- `RSI = 100 − 100 / (1 + média das altas / média das baixas)`. Sem baixas, o RSI é 100; sem altas, 0. Velas sem nenhuma variação também dão 100, como no TradingView.
- **Aquecimento:** `maxMaPeriod()` pede **4 × o período** de velas antes da janela visível (`ensureWarmup`). A média de Wilder demora para esquecer o começo; com essa folga, o valor fica igual ao do TradingView.

## Cache e estado persistido

- `priceChartRsiPane`: `"1"` ou `"0"`, desligado por padrão.
- `priceChartRsi`: JSON `{ period, overbought, oversold, color, opacity, maOn, maType, maPeriod, maColor, overboughtColor, oversoldColor, lineStyle, lineWidth, levelOpacity, showMid }`. Os campos que faltarem (de versões anteriores) assumem o padrão.

## Casos de borda e armadilhas

- Com menos de `period + 1` velas, o painel fica vazio. A média do RSI precisa de mais `maPeriod` valores do RSI.
- Se a altura do RSI já foi salva antes, ao arrastar uma divisória, ela continua valendo no lugar dos 150 px padrão.
- O RSI usa as velas da **vela atual**: um RSI 14 em D é diferente de um em 4h.
- Em par invertido (`USDT<moeda>`), o fechamento já vem invertido, então o RSI é o da moeda em USDT.

## Checklist ao alterar

- Mudou a fórmula: ajuste `test/public/rsi.test.js`.
- Mudou um limite: ajuste `normalizeRsiSettings`, os `min`/`max` dos campos em `paneSettings.js` e este doc.

## Como verificar

1. Em BTC D, ligue "RSI": o painel aparece logo abaixo do CVD (ou do Volume), antes de Liquidações, com linhas em 70, 50 e 30. Compare o valor com o RSI 14 do TradingView na mesma vela.
2. Na engrenagem, mude o período para 7 e os níveis para 80/20: a linha e as tracejadas acompanham, e o título vira "RSI 7".
3. Mude a cor e a opacidade e passe a mira: aparece "sobrecomprado" ou "sobrevendido" nas velas além dos níveis.
4. Ligue "Mostrar a média móvel", troque para EMA 9 e mude a cor: a segunda linha aparece no painel, e o título mostra "EMA 9 …". Compare com a "MA do RSI" do TradingView.
5. Mude as cores, o estilo (sólida, pontilhada), a espessura e a opacidade das linhas de nível e desligue a linha do meio: as linhas acompanham.
6. Com CVD e OI ligados, desligue e religue o RSI e o Volume: a ordem continua a das Camadas, e nenhum painel fica vazio.
7. Recarregue: o painel e as configurações persistem.
