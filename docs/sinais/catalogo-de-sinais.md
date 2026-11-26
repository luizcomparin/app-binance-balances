---
titulo: Sinais — catálogo
resumo: Lista de cada sinal planejado (regra, limiares padrão, fonte, o que indica, etapa) e dos sinais candidatos para depois da v1.
arquivos: [public/components/price-chart/signals/signals.js]
rotas: []
eventos: []
storage: []
---

# Catálogo de sinais

> As regras e os limiares são os **padrões fixos da v1** (`SIGNAL_DEFAULTS` em `signals/signals.js`). A coluna "Estado" diz o que já existe no núcleo de cálculo; os "planejados" são revisados quando forem implementados. Os implementados já aparecem no campo "Sinais" do gráfico de preço.

Convenções:

- **D** = velas diárias, **S** = velas semanais.
- "Há N velas" conta velas **fechadas** seguidas com o sinal ativo. O valor e o estado ativo usam a última vela, mesmo em andamento; se só ela estiver na zona, o sinal sai como "na vela em formação" (`forming`).
- **Percentil:** posição do valor atual entre todos os valores do histórico carregado da própria moeda. O texto mostra a parte do histórico que fica abaixo do valor (`percentileRank`). Para decidir se o valor é extremo, os empates contam pela metade (`midRank`): uma série parada num valor só fica em 50 e não vira sinal, e um valor empatado com o máximo (funding travado no teto por dias) continua perto de 100. A amostra são as velas fechadas. Exige um mínimo de amostras (365 em D, 52 em S); abaixo disso o sinal fica indisponível (`reason: "history"`).
- "Etapa" aponta para o [planejamento](planejamento.md).

## Tendência

| Id | Sinal | Regra padrão | Fonte | Etapa | Estado |
|---|---|---|---|---|---|
| `trend-ma-d` | Tendência diária por médias | Alta: fechamento acima da SMA 50 e da SMA 200, com SMA 50 acima da SMA 200. Baixa: o inverso. Qualquer outra combinação: lateral. Mostra também a inclinação da SMA 200 (valor atual × o de 10 velas atrás) | velas D, `movingAverage` | 1 | implementado |
| `trend-ma-w` | Tendência semanal por médias | Igual, com SMA 20 e SMA 50 semanais | velas S, `movingAverage` | 1 | implementado |
| `macd-d` | MACD diário (12/26/9, EMA) | Igual ao semanal, como leitura secundária | velas D, `macd` | 3 | implementado |
| `macd-w` | MACD semanal (12/26/9, EMA) | Linha MACD acima de zero: favorece alta; abaixo: baixa. "Há N velas" conta as velas fechadas seguidas desse lado do zero. Avisa o cruzamento com a linha de sinal (o histograma trocou de lado) se foi nas últimas 3 velas, contando a em formação, e o histograma perdendo força (barra voltando em direção ao zero, `macdHistogramTones`) | velas S, `macd` | 3 | implementado |

A tendência exibida no campo resumido (`trend.d`, `trend.w`) vem dos sinais por médias; o MACD aparece na janela, na mesma seção, como confirmação ou divergência dela. O MACD não entra no placar de fundo/topo.

## Fundo ou topo (entram no placar de confluência)

No placar, os sinais contam por **família** (`SIGNAL_FAMILIES`): RSI (`rsi-d`, `rsi-w`), divergência de RSI (`rsi-div-d`, `rsi-div-w`), esticagem da média (`stretch-d`, `stretch-w`), sentimento do mercado (`fng`) e futuros (`funding`, `liq`).

| Id | Sinal | Regra padrão | Lado | Fonte | Etapa | Estado |
|---|---|---|---|---|---|---|
| `rsi-d` | RSI 14 diário | ≤ 30: sobrevendido; ≥ 70: sobrecomprado. Mostra há quantos dias | ≤30 fundo, ≥70 topo | velas D, `rsi` | 1 | implementado |
| `rsi-w` | RSI 14 semanal | Mesmos níveis; mostra há quantas semanas | idem | velas S, `rsi` | 1 | implementado |
| `stretch-d` | Esticagem da SMA 200 diária | `fechamento / SMA 200 − 1`, comparada com o histórico da moeda. Fundo: preço **abaixo** da média e percentil ≤ 10. Topo: preço **acima** da média e percentil ≥ 90. Mostra o valor atual, o percentil e os extremos já atingidos (máximo e mínimo históricos da esticagem) | ≤10 fundo, ≥90 topo | velas D (até 3 páginas), `movingAverage` | 1 | implementado |
| `stretch-w` | Esticagem da SMA 50 semanal | Igual, sobre as velas semanais | idem | velas S | 1 | implementado |
| `fng` | Fear & Greed extremo | ≤ 25 (medo extremo) ou ≥ 76 (ganância extrema). Mostra há quantos dias seguidos, contando o de hoje | ≤25 fundo, ≥76 topo | `/fear-greed` | 3 | implementado |
| `funding` | Funding extremo | Média das taxas cobradas nos últimos 7 dias, comparada com a mesma média ao longo do histórico devolvido pela rota (cerca de 166 dias). Fundo: média **negativa** e percentil ≤ 10. Topo: média **positiva** e percentil ≥ 90. Mostra há quantos dias a média de 7 dias está na zona | negativo e baixo fundo, alto topo | `/futures-data?period=1d` | 4 | implementado |
| `liq` | Cascata de liquidações | Soma liquidada nos últimos 7 dias (contando hoje), por lado, comparada com as janelas de 7 dias dos **últimos 2 anos** da moeda. Percentil ≥ 90 em longs liquidados ou em shorts liquidados; com os dois lados acima, vale o de maior percentil. 3 corretoras (Binance + Bybit + OKX). Dia sem linha vale zero. Mostra há quantos dias a janela está na zona | longs liquidados fundo, shorts liquidados topo | `/liquidations` (D) | 4 | implementado |
| `rsi-div-d` | Divergência RSI × preço (D) | Fundo (de alta): o preço faz um fundo mais baixo que o anterior e o RSI 14, um fundo mais alto; o RSI do 1º fundo precisa estar até 40. Topo (de baixa): topo mais alto no preço e mais baixo no RSI; RSI do 1º topo a partir de 60. Pivôs de 5 velas de cada lado, no máximo 60 velas entre eles, e o 2º pivô com até 20 velas | de alta fundo, de baixa topo | velas D (mínima e máxima), `rsi` | 5 | implementado |
| `rsi-div-w` | Divergência RSI × preço (S) | Igual, com pivôs de 3 velas de cada lado, no máximo 26 velas entre eles e 2º pivô com até 8 velas | idem | velas S, `rsi` | 5 | implementado |

Observações sobre os padrões:

- **Esticagem exige o lado certo da média:** numa moeda que passou quase todo o histórico acima da média, o percentil 10 pode ser um preço encostado nela, e isso não é "esticado para baixo". Por isso o sinal de fundo só vale com o preço abaixo da média, e o de topo, acima.
- **Tendência sem a média longa** (menos de 200 velas diárias ou 50 semanais) fica indisponível.
- **Fear & Greed em 76, e não 75:** o plano dizia 75, mas na Alternative.me a zona "ganância extrema" começa em 76 (75 ainda é "ganância"). O sinal segue a zona da fonte, igual ao painel do gráfico.
- **Fear & Greed não tem vela em formação:** o valor do dia já sai fechado, às 00:00 UTC. Com o último valor mais velho que 2 dias, o sinal fica indisponível.
- **Fear & Greed** é do mercado (calculado sobre o BTC): o mesmo valor vale para qualquer moeda. Ainda assim entra no placar de cada uma, porque altcoins costumam fazer fundo e topo junto com o mercado.
- **Liquidações em percentil**, e não em USDT fixo: o mesmo valor é irrelevante no BTC e enorme numa altcoin. A conta se parece com a de `topShareCutoff` em `chart/liquidationBubbles.js`.
- **Divergência: como os pivôs são achados.** Um fundo é a vela cuja **mínima** é a menor entre as N velas de cada lado, todas fechadas (topo: a **máxima**). O sinal olha só os dois pivôs mais recentes de cada tipo e lê o RSI (de fechamento) nessas duas velas.
- **Divergência: quando deixa de valer.** Quando o 2º pivô fica mais velho que o limite, ou quando o preço passa dele (nova mínima depois de uma divergência de alta, nova máxima depois de uma de baixa), inclusive na vela em formação.
- **Divergência: filtro do 1º pivô** (RSI até 40 nos fundos, a partir de 60 nos topos). Sem ele, qualquer oscilação no meio da faixa do RSI viraria divergência.
- **Divergência chega atrasada por definição:** o 2º fundo só é confirmado 5 dias (ou 3 semanas) depois. "2º fundo há N dias" conta as velas fechadas desde ele.
- **Funding exige o lado certo do zero**, como a esticagem. O plano dizia "percentil ≤ 10 ou negativo", mas funding baixo e ainda positivo só quer dizer pouca alavancagem comprada; o sinal contrário de fundo é o funding negativo (vendidos pagando), e ele precisa ser baixo para a própria moeda, porque em algumas altcoins o funding negativo é comum.
- **Liquidações só contra os últimos 2 anos** (`liqLookbackDays`), com mínimo de 180 dias de histórico: o mercado de futuros cresceu, e comparar com anos antigos faria qualquer semana recente parecer extrema.
- **Funding e liquidações são opcionais:** sem contrato perpétuo ou sem chave da Coinalyze, ficam "indisponíveis" e saem do placar.
- **Qual média usar na esticagem** (SMA 200 em D, SMA 50 em S) é o padrão inicial. A pessoa usa outras no gráfico (SMA 20, EMA 50/100/200, SMA 400); escolher a média é candidato a configuração futura.

## Região (placar)

- Implementado em `regionOf`. Uma família conta para "fundo" (ou "topo") quando ao menos um dos seus sinais disponíveis está ativo nesse lado. O denominador é o número de famílias com algum sinal **disponível**.
- "Fundo provável" ou "Sobrecomprado" (o lado de topo; ver [calibracao.md](calibracao.md)): 3 ou mais famílias de um lado (`regionMin`) e no máximo 1 do outro (`regionMaxOpposite`); senão, "neutra".
- Uma família pode contar para os dois lados ao mesmo tempo (RSI diário sobrevendido com o semanal sobrecomprado).
- A regra foi revista na etapa 6: até então contava sinais soltos (3 de 9), o que não distinguia nada. Os números estão em [calibracao.md](calibracao.md).
- A janela mostra o placar dos dois lados e os sinais por família; o campo resumido mostra só o lado dominante.

## Candidatos para depois da v1

Levantados na discussão inicial. Só entram depois de ver quais sinais da v1 se pagam (ver "Backtest" no [planejamento](planejamento.md#preparos-para-a-v2)).

**Fundo ou topo**

- **Clímax de volume:** volume acima de k× a média com pavio longo (capitulação ou exaustão).
- **Posição na faixa de 52 semanas** e **queda desde a máxima histórica**.
- **Preço fora da Bollinger** no semanal (`bollinger`).
- **Movimento em σ:** variação dos últimos N dias medida em desvios (`dailyVolatility`).

**Tendência**

- **Cruzamento de médias** (50 × 200 em D, 20 × 50 em S) como evento datado.
- **Estrutura de topos e fundos** ascendentes ou descendentes.

**Contexto**

- **Tendência do BTC** ao analisar uma altcoin (sinal de compra em altcoin com BTC em queda falha muito) e o par moeda/BTC.
- **Aperto da Bollinger** (largura mínima): movimento forte iminente, sem direção.
- **Divergência do CVD:** preço sobe com venda agressiva dominando, ou o inverso (`volumeDelta`).
- **Preço × preço médio da pessoa:** só informativo.

**Deixados de fora de propósito**

- **Open interest e long/short:** a Binance só guarda 30 dias, o que não sustenta leitura em D/S. Voltam a ser viáveis com o OI agregado e histórico longo da Coinalyze (ver [ideias-futuras](../backlog/ideias-futuras.md)).
- **Mapa de liquidação estimado:** é estimativa, de 30 dias, e fala do curto prazo.
