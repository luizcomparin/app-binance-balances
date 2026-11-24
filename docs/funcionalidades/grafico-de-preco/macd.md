---
titulo: Camada MACD
resumo: Painel abaixo do gráfico com o MACD do fechamento (média rápida − média lenta, linha de sinal e histograma, como no TradingView) e engrenagem para médias, tipos, cores e histograma.
arquivos: [public/components/price-chart/chart/macd.js]
rotas: []
eventos: []
storage: [priceChartMacdPane, priceChartMacd]
---

# MACD

## O que faz

O checkbox "MACD" (`#price-chart-macd-pane`), em "Painéis abaixo do gráfico" nas Camadas, liga um painel com o **MACD** das velas do gráfico. Ele vem depois do Volume, do CVD e do RSI e antes de Liquidações e dos painéis de futuros, na ordem dos checkboxes.

- **Linha MACD** (azul) e **linha de sinal** (laranja), com uma linha pontilhada em zero.
- **Histograma** (MACD − sinal): verde acima de zero e vermelho abaixo. A barra fica num tom mais claro quando a força diminui, ou seja, quando ela volta em direção ao zero, como no TradingView.
- **Título:** "MACD 12 26 9" com os valores da vela sob a mira (ou da última): MACD, Sinal e Hist. As casas decimais acompanham a grandeza (o MACD tem a escala do preço). A dica do título explica a leitura (`FUTURES_HELP.macd`).
- O painel começa com **130 px** de altura (`PANE_DEFAULT_HEIGHTS.macd`). Dá para arrastar a divisória, e a altura fica salva.
- **Engrenagem** logo à direita do nome. A caixa rola se não couber:

| Seção | Configuração | Faixa | Padrão |
|---|---|---|---|
| — | Média rápida | 2–100 | 12 |
| — | Média lenta | 2–200 | 26 |
| — | Tipo das médias | EMA/SMA | EMA |
| — | Sinal | 1–100 | 9 |
| — | Tipo do sinal | EMA/SMA | EMA |
| Linhas | Cor do MACD | — | azul |
| Linhas | Cor do sinal | — | laranja |
| Histograma | Mostrar | — | ligado |
| Histograma | Cor acima de zero | — | verde |
| Histograma | Cor abaixo de zero | — | vermelho |
| Histograma | Opacidade | — | 85% |

## Página (front)

- `chart/macd.js`:
  - `macd(points, s)` → `{ macd, signal, hist }` alinhados às velas, com `null` enquanto as médias não têm velas suficientes. Usa `movingAverage` para as médias rápida e lenta e `rsiMovingAverage` para o sinal: uma média que começa no primeiro valor não nulo.
  - `macdHistogramTones(hist)` → `[{ up, strong }]`.
  - `normalizeMacdSettings(c)` coloca as configurações nos limites (`MACD_DEFAULT`).
- `paneSettings.js`: `getMacdSettings()` e `mountMacd`, a caixa da engrenagem (`.fp-settings-macd`). Usa o mesmo formulário de campos `data-k` do RSI (`fieldBuilders`, `mountKeyedForm`).
- `PriceChartPanel.js`: flag `view.showMacd` (`priceChartMacdPane`). `render()` envia `macd: getMacdSettings()` ou `null`.
- `chart/createChart.js`: conta o painel como 1,3 em `--sub-panes` e chama `futures.setMacd(macd)`.
- `chart/futuresPanes.js`:
  - `createMacdSeries` cria três séries no mesmo painel: histograma (atrás), linha MACD e linha de sinal, mais a linha de zero.
  - `setMacd(m)` liga e desliga o painel por `rebuildTop` (ver [paineis-de-futuros](paineis-de-futuros.md)).
  - `drawMacd` só recalcula quando mudam as velas, os parâmetros ou a aparência do histograma. Com o histograma desligado, a série dele fica vazia.
  - `macdNum` formata os valores conforme a grandeza.

## Regras de negócio e fórmulas

- `MACD = média(fechamento, rápida) − média(fechamento, lenta)`, com EMA por padrão. A EMA começa pela SMA das primeiras velas, como o `ta.ema` do TradingView.
- `Sinal = média(MACD, sinal)`, contada a partir do primeiro valor do MACD.
- `Histograma = MACD − Sinal`.
- Tom do histograma, comparando com a barra anterior: acima de zero, é forte se cresceu; abaixo de zero, é forte se caiu. Nos outros casos, a barra é desenhada com 45% da opacidade.
- **Aquecimento:** `maxMaPeriod()` pede `3 × lenta + sinal` velas antes da janela visível. As EMAs demoram para esquecer o começo; com essa folga, o valor fica igual ao do TradingView.

## Cache e estado persistido

- `priceChartMacdPane`: `"1"` ou `"0"`, desligado por padrão.
- `priceChartMacd`: JSON `{ fast, slow, signal, oscType, signalType, macdColor, signalColor, showHist, histUpColor, histDownColor, histOpacity }`. Os campos que faltarem assumem o padrão.

## Casos de borda e armadilhas

- Com menos velas que a média lenta, o painel fica vazio. O sinal e o histograma precisam de mais `sinal` valores.
- Média rápida maior que a lenta é aceita, como no TradingView: o MACD só inverte o sinal.
- O MACD tem a grandeza do preço: valores de moedas baratas são minúsculos. O eixo e o título usam casas decimais variáveis.

## Checklist ao alterar

- Mudou a fórmula: ajuste `test/public/macd.test.js`.
- Mudou um limite: ajuste `normalizeMacdSettings`, os `min`/`max` dos campos em `paneSettings.js` e este doc.

## Como verificar

1. Em BTC D, ligue "MACD": o painel aparece depois do RSI (ou do CVD/Volume) e antes de Liquidações. Compare MACD, Sinal e Hist. com o MACD 12 26 9 do TradingView na mesma vela.
2. Passe a mira: o título acompanha, e as barras do histograma clareiam quando voltam em direção ao zero.
3. Na engrenagem, mude para 8/21/5, troque os tipos para SMA, mude as cores e desligue o histograma: o painel acompanha.
4. Abra uma moeda barata (ex.: PEPE): os valores aparecem com casas decimais suficientes.
5. Com RSI, CVD e OI ligados, desligue e religue o MACD e o Volume: a ordem continua a das Camadas, e nenhum painel fica vazio.
6. Recarregue: o painel e as configurações persistem.
