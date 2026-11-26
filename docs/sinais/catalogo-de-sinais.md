---
titulo: Sinais — catálogo
resumo: Lista de cada sinal planejado (regra, limiares padrão, fonte, o que indica, etapa) e dos sinais candidatos para depois da v1.
arquivos: []
rotas: []
eventos: []
storage: []
---

# Catálogo de sinais

> **Estado: planejado.** As regras e os limiares abaixo são os **padrões iniciais** combinados antes da implementação. Cada sinal é revisado quando for implementado; o que mudar é corrigido aqui, e a coluna "Estado" passa a "implementado".

Convenções:

- **D** = velas diárias, **S** = velas semanais.
- "Há N velas" conta velas **fechadas** seguidas com o sinal ativo. A vela em andamento entra só como valor atual, marcada como "em formação" (a confirmar na etapa 1).
- **Percentil:** posição do valor atual entre todos os valores do histórico carregado da própria moeda. Exige um mínimo de amostras; abaixo disso o sinal fica "indisponível: pouco histórico".
- "Etapa" aponta para o [planejamento](planejamento.md).

## Tendência

| Id | Sinal | Regra padrão | Fonte | Etapa | Estado |
|---|---|---|---|---|---|
| `trend-ma-d` | Tendência diária por médias | Alta: fechamento acima da SMA 50 e da SMA 200, com SMA 50 acima da SMA 200. Baixa: o inverso. Qualquer outra combinação: lateral. Mostra também a inclinação da SMA 200 (valor atual × o de 10 velas atrás) | velas D, `movingAverage` | 1 | planejado |
| `trend-ma-w` | Tendência semanal por médias | Igual, com SMA 20 e SMA 50 semanais | velas S, `movingAverage` | 1 | planejado |
| `macd-w` | MACD semanal (12/26/9) | Acima de zero: favorece alta; abaixo: baixa. Avisa cruzamento do sinal nas últimas 3 velas e histograma perdendo força (barras voltando ao zero, `macdHistogramTones`) | velas S, `macd` | 3 | planejado |
| `macd-d` | MACD diário (12/26/9) | Igual ao semanal, como leitura secundária | velas D, `macd` | 3 | planejado |

A tendência exibida no campo resumido (`trend.d`, `trend.w`) vem dos sinais por médias; o MACD aparece como confirmação ou divergência dela.

## Fundo ou topo (entram no placar de confluência)

| Id | Sinal | Regra padrão | Lado | Fonte | Etapa | Estado |
|---|---|---|---|---|---|---|
| `rsi-d` | RSI 14 diário | ≤ 30: sobrevendido; ≥ 70: sobrecomprado. Mostra há quantos dias | ≤30 fundo, ≥70 topo | velas D, `rsi` | 1 | planejado |
| `rsi-w` | RSI 14 semanal | Mesmos níveis; mostra há quantas semanas | idem | velas S, `rsi` | 1 | planejado |
| `stretch-d` | Esticagem da SMA 200 diária | `fechamento / SMA 200 − 1`, comparada com o histórico da moeda. Percentil ≤ 10: muito abaixo da média; ≥ 90: muito acima. Mostra o valor atual, o percentil e os extremos já atingidos (máximo e mínimo históricos da esticagem) | ≤10 fundo, ≥90 topo | velas D (até 3 páginas), `movingAverage` | 1 | planejado |
| `stretch-w` | Esticagem da SMA 50 semanal | Igual, sobre as velas semanais | idem | velas S | 1 | planejado |
| `fng` | Fear & Greed extremo | ≤ 25 (medo extremo) ou ≥ 75 (ganância extrema). Mostra há quantos dias seguidos | ≤25 fundo, ≥75 topo | `/fear-greed` | 3 | planejado |
| `funding` | Funding extremo | Média da taxa nos últimos 7 dias no percentil ≤ 10 (ou negativa) ou ≥ 90 do histórico de ~333 dias | baixo/negativo fundo, alto topo | `/futures-data?period=1d` | 4 | planejado |
| `liq` | Cascata de liquidações | Soma liquidada nos últimos 7 dias, por lado, comparada com todas as janelas de 7 dias do histórico. Percentil ≥ 90 em longs liquidados ou em shorts liquidados. 3 corretoras (Binance + Bybit + OKX) | longs liquidados fundo, shorts liquidados topo | `/liquidations` (D) | 4 | planejado |
| `rsi-div-d` | Divergência RSI × preço (D) | Fundo: o preço faz mínima mais baixa que a do pivô anterior e o RSI faz mínima mais alta. Topo: o inverso. Pivôs e janela a definir na etapa 5 | altista fundo, baixista topo | velas D, `rsi` | 5 | planejado |
| `rsi-div-w` | Divergência RSI × preço (S) | Igual, nas velas semanais | idem | velas S, `rsi` | 5 | planejado |

Observações sobre os padrões:

- **Fear & Greed** é do mercado (calculado sobre o BTC): o mesmo valor vale para qualquer moeda. Ainda assim entra no placar de cada uma, porque altcoins costumam fazer fundo e topo junto com o mercado.
- **Liquidações em percentil**, e não em USDT fixo: o mesmo valor é irrelevante no BTC e enorme numa altcoin. A conta se parece com a de `topShareCutoff` em `chart/liquidationBubbles.js`.
- **Funding e liquidações são opcionais:** sem contrato perpétuo ou sem chave da Coinalyze, ficam "indisponíveis" e saem do placar.
- **Qual média usar na esticagem** (SMA 200 em D, SMA 50 em S) é o padrão inicial. A pessoa usa outras no gráfico (SMA 20, EMA 50/100/200, SMA 400); escolher a média é candidato a configuração futura.

## Região (placar)

- Cada sinal da tabela acima que estiver **ativo** conta um ponto para "fundo" ou para "topo". O denominador é o número de sinais **disponíveis**.
- Leitura padrão (a calibrar na etapa 6): "fundo provável" ou "topo provável" quando um lado tiver pelo menos 3 sinais ativos e o outro, nenhum ou um; senão, "neutra".
- A janela mostra o placar dos dois lados e a lista; o campo resumido mostra só o lado dominante.

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
