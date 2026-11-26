---
titulo: Sinais — calibração da v1 (varredura histórica)
resumo: O que uma varredura do passado de 5 moedas mostrou sobre a frequência de cada sinal e o que o preço fez depois; base da regra do placar por famílias e o achado de que os sinais de topo não antecederam quedas.
arquivos: []
rotas: []
eventos: []
storage: []
---

# Calibração da v1

Registro da revisão feita na etapa 6 (26/11/2026). Serve para explicar **por que** a regra do placar é a que é e o que ainda não se sabe.

> **Isto não é o backtest.** Foi uma conferência rápida, com as limitações listadas abaixo. O backtest de verdade continua planejado para a v2 (ver [planejamento](planejamento.md#backtest-dos-sinais)). Os números não devem ser lidos como taxa de acerto.

## Como foi feita

- **Moedas:** BTC, ETH, SOL, XRP e LINK, velas da Binance pelo server local.
- **Período:** de maio/2020 a novembro/2026, um ponto por dia e por moeda: 11.166 dias-moeda.
- **Sem dado do futuro:** em cada dia, `analyzeSignals` recebeu só as velas até ele (a vela semanal em andamento fechada no preço do dia), o Fear & Greed e as liquidações até a data. Os percentis usaram só o histórico anterior.
- **Sem funding:** a rota só devolve cerca de 166 dias; o sinal ficou indisponível na varredura.
- **Medida:** variação do fechamento 30 e 90 dias depois de cada dia.
- **Ferramenta:** um script avulso, fora do repositório. Para refazer, é preciso reescrevê-lo (ou trazê-lo para o repositório quando o backtest da v2 for feito).

### Limitações

- Dias seguidos com o mesmo sinal não são observações independentes: 400 dias podem ser 30 episódios. A tabela mostra os dois números.
- As 5 moedas sobem e descem juntas; na prática são poucos ciclos de mercado, e o período inclui a alta forte de 2020–2021.
- Nenhum limiar foi ajustado para melhorar estes números. Testar limiares na mesma amostra e escolher o melhor só produziria ajuste excessivo.

## Linha de base

Em um dia qualquer, o preço estava mais alto 30 dias depois em 50% dos casos (mediana 0%) e 90 dias depois em 54% (mediana +4%). Um sinal só diz algo se ficar longe disso.

## Sinais de fundo, um a um

| Sinal | Dias ativos | Episódios | 30 dias: mediana / em alta | 90 dias: mediana / em alta |
|---|---|---|---|---|
| RSI semanal sobrevendido | 1,5% | 27 | +10% / 82% | +14% / 76% |
| Divergência de alta semanal | 2,2% | 7 | +12% / 74% | +27% / 91% |
| RSI diário sobrevendido | 3,4% | 107 | +1% / 55% | +14% / 70% |
| Divergência de alta diária | 3,9% | 46 | +2% / 55% | +2% / 55% |
| Esticagem diária para baixo | 11,4% | 101 | +3% / 56% | −5% / 45% |
| Esticagem semanal para baixo | 8,0% | 57 | −1% / 49% | −3% / 46% |
| Cascata de longs | 11,3% | 211 | −4% / 40% | −2% / 48% |
| Fear & Greed em medo extremo | 21,7% | 406 | −1% / 48% | −6% / 44% |

Leitura:

- Os sinais **raros** (RSI semanal, divergência semanal) vieram antes de altas com mais frequência, mas com poucos episódios (7 no caso da divergência semanal).
- Os sinais **frequentes** (medo extremo em 22% dos dias, cascata de longs e esticagem em cerca de 10%) sozinhos não disseram nada, ou vieram antes de mais queda: eles acendem durante toda a tendência de baixa, não só no fim.

## Sinais de topo, um a um

| Sinal | Dias ativos | Episódios | 30 dias: mediana / em alta | 90 dias: mediana / em alta |
|---|---|---|---|---|
| RSI diário sobrecomprado | 7,6% | 202 | +8% / 65% | +11% / 62% |
| RSI semanal sobrecomprado | 9,3% | 96 | +7% / 60% | +22% / 63% |
| Divergência de baixa diária | 6,1% | 67 | −1% / 48% | 0% / 50% |
| Divergência de baixa semanal | 5,1% | 17 | +2% / 55% | +12% / 62% |
| Esticagem diária para cima | 5,7% | 49 | 0% / 50% | +4% / 53% |
| Esticagem semanal para cima | 7,9% | 44 | +7% / 60% | +26% / 65% |
| Cascata de shorts | 6,6% | 141 | +4% / 61% | +4% / 54% |
| Fear & Greed em ganância extrema | 10,0% | 256 | +2% / 53% | +10% / 56% |

**Nenhum sinal de topo veio antes de quedas.** Quase todos vieram antes de **mais alta** que a linha de base: nesta amostra eles funcionaram como sinais de força, não de reversão. Só a divergência de baixa diária ficou na linha de base.

## Placar: sinais soltos × famílias

Muitos sinais medem a mesma coisa e acendem juntos (RSI diário e semanal; esticagem diária e semanal). Por isso foram comparadas duas formas de contar, sempre com no máximo 1 do lado oposto:

| Regra | Dias | Episódios | 30 dias: mediana / em alta | 90 dias: mediana / em alta |
|---|---|---|---|---|
| Fundo: 3 ou mais **sinais** (regra antiga) | 7,0% | 138 | +3% / 58% | +3% / 53% |
| Fundo: 4 ou mais sinais | 2,1% | 55 | +7% / 69% | +12% / 65% |
| Fundo: 3 ou mais **famílias** (regra adotada) | 4,2% | 112 | +5% / 65% | +12% / 66% |
| Topo: 3 ou mais sinais (regra antiga) | 7,4% | 113 | +5% / 58% | +12% / 60% |
| Topo: 3 ou mais famílias (regra adotada) | 5,0% | 112 | +8% / 60% | +22% / 64% |

- **Fundo:** com 3 sinais soltos, o resultado era o da linha de base. Contando famílias, "fundo provável" ficou mais raro e veio antes de alta em cerca de dois terços dos dias. Foi o que motivou a troca.
- **Topo:** em nenhuma das formas "topo provável" veio antes de queda. Veio antes de mais alta.
- Por moeda, a regra por famílias também ficou mais equilibrada: "fundo provável" em 6,2% dos dias no BTC, 4,4% no ETH, 4,0% na SOL, 3,4% no XRP e 2,9% na LINK (com sinais soltos, o XRP e a LINK passavam de 8%).

## Limiares mais exigentes (testados e não adotados)

Como o medo extremo fica ativo em 22% dos dias, foi testada uma versão mais exigente: Fear & Greed em 15/85 e liquidações no percentil 95.

- Medo extremo até 15: ativo em 7,9% dos dias, e o resultado seguinte continuou na linha de base (30 dias: 0% / 51%).
- Cascata de longs no percentil 95: 6,9% dos dias, resultado um pouco pior (30 dias: −5% / 37%).
- "Fundo provável" por famílias: 2,7% dos dias, com resultado parecido (30 dias: +5% / 67%).

Não houve ganho claro, então os limiares ficaram como estavam.

## O que foi decidido

1. **O placar passou a contar famílias** (`SIGNAL_FAMILIES` em `signals/signals.js`): RSI, divergência de RSI, esticagem da média, sentimento do mercado e futuros. "Fundo provável" ou "topo provável" exige 3 ou mais famílias de um lado e no máximo 1 do outro.
2. **Os limiares de cada sinal não mudaram.**

## O que ficou em aberto

- **O nome "Topo provável".** A varredura não sustenta a leitura de que essa região antecede queda; ela antecedeu mais alta. Opções: manter o nome com um aviso na janela; trocar por algo descritivo ("Sobrecomprado", "Esticado para cima"); ou deixar o lado de topo só como lista de sinais, sem rótulo de região. Decisão pendente (ver [planejamento](planejamento.md#pendências-de-decisão)).
- **Peso por sinal.** Os sinais raros foram os mais informativos e os frequentes, os menos. Dar o mesmo peso a todos é simples, mas não é o que os números sugerem. Fica para o backtest.
- **Fundo depende de a queda parar.** Medo extremo, cascata de longs e esticagem acendem durante toda a baixa. Um filtro do tipo "o preço parou de fazer mínimas" (ou a divergência, que já exige isso) pode separar o fim da queda do meio dela. Ideia para testar no backtest.
- **Funding** não foi avaliado.
