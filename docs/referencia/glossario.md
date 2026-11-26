---
titulo: Glossário
resumo: Termos de domínio usados no código e na interface, com o nome correspondente no código.
arquivos: []
rotas: []
eventos: []
storage: []
---

# Glossário

| Termo (interface) | No código | Significado |
|---|---|---|
| Moeda / ativo | `asset`, `baseAsset` | Ativo da carteira (BTC, XRP…). |
| Par | `symbol`, `pair` | Mercado da Binance: base + cotação (`BTCUSDT`, `ETHBTC`). |
| Moeda de cotação | `quoteAsset` | Segunda moeda do par, em que o preço é expresso. |
| Livre / Em ordens | `free` / `locked`, `freeUSDT` / `lockedUSDT` | Saldo disponível / saldo reservado em ordens abertas. |
| % da carteira | `pct` | `totalUSDT` da moeda ÷ total da carteira × 100. |
| Sem cotação | `unpriced` | Moedas para as quais `getPriceInUSDT` não achou preço; ficam fora do total. |
| Preço médio dinâmico de compra | `avgBuyPriceUSDT` | Custo médio ponderado da posição **atual**. As compras aumentam a quantidade e o custo; as vendas reduzem a quantidade pelo médio vigente, sem alterar o médio. Zerou, recomeça. |
| Ciclo | `soldQtyCycle` | Período desde a compra que reabriu uma posição zerada. |
| Preço médio dinâmico de venda | `avgSellPriceUSDT` | Valor recebido nas vendas do ciclo atual (líquido de taxas) ÷ quantidade vendida no ciclo. |
| Preço médio fixo | `dca.yourAvg` | Média de **todas** as compras (total gasto ÷ total comprado), ignorando vendas. Usado na comparação com DCA. |
| Custo | `costBasisUSDT` | Quantidade atual × preço médio dinâmico. |
| P&L não realizado | `unrealizedPnlUSDT/Pct` | Valor de mercado − custo. |
| Realizado | `realizedPnlUSDT` | Soma, em cada venda, de (recebido − médio × quantidade), só sobre a parte com custo conhecido. |
| Investido | `investedUSDT` | Soma de todas as compras (com taxas). |
| Cobertura | `coverage` | Fração da quantidade atual explicada pelos trades (o resto veio de depósito, Convert, Earn…). Abaixo de 95% aparece ⚠. |
| Distância | `distancePct` | Quanto o preço atual precisa andar até a ordem aberta executar. |
| Sinais | `analyzeSignals`, `signals` | Leituras dos indicadores no diário e no semanal que apontam tendência, fundo ou topo. Ver [sinais](../sinais/README.md). |
| Região (fundo provável, sobrecomprado, neutra) | `region.side` (`bottom`, `top`, `neutral`) | Resultado do placar de confluência: 3 ou mais famílias de sinais de um lado e no máximo 1 do outro. O lado de topo aparece como "Sobrecomprado". |
| Vezes anteriores | `outcomeStats`, `episodes` | Quantas vezes um sinal já ativou no histórico da moeda (depois de mais de 14 dias apagado) e o que o preço fez 30 e 90 dias depois. |
| Linha de base | `stats.base` | O que o preço fez a partir de um dia qualquer do mesmo histórico; referência para ler as "vezes anteriores". |
| Família (grupo) de sinais | `family`, `SIGNAL_FAMILIES` | Sinais que medem a mesma coisa e contam uma vez só no placar: RSI, divergência de RSI, esticagem da média, sentimento do mercado, futuros. |
| Esticagem | `stretch-d`, `stretch-w` | Distância, em %, do preço até uma média móvel (SMA 200 diária, SMA 50 semanal), comparada com o histórico da própria moeda. |
| Divergência de RSI | `rsi-div-d`, `rsi-div-w` | O preço faz fundo mais baixo e o RSI, mais alto (de alta); ou topo mais alto no preço e mais baixo no RSI (de baixa). |
| Pivô | `divPivot` | Fundo ou topo confirmado: a mínima (ou máxima) da vela é o extremo entre N velas fechadas de cada lado. |
| Cascata de liquidações | `liq` | Soma liquidada em 7 dias entre as 10% maiores dos últimos 2 anos da moeda. De longs conta como fundo; de shorts, como topo. |
| Vela em formação | `forming` | A vela ainda em andamento. O valor do sinal a usa, mas o "há N velas" conta só as fechadas. |
| Médio após compras/vendas abertas | `projectedAvg` / `projectedSellAvg` | Preço médio se todas as ordens abertas daquele lado executassem. |
| Vela / tamanho da vela | `interval` (`1h·4h·1d·1w·1M`) | Agregação OHLC. |
| Período | `range` | Janela de tempo visível (`7d … all`, ou personalizada `<n>d/m/y`). |
| Open interest (OI) | `oi` | Valor total dos contratos de futuros em aberto (USDT). |
| Long/Short | `globalLS`, `topLS` | Fração de contas (ou de posição dos top traders) compradas. |
| Funding | `funding`, `nextFunding` | Taxa paga entre comprados e vendidos a cada 8 h nos perpétuos. |
| Perpétuo / multiplier | `getPerpetualFor` → `{ symbol, multiplier }` | Contrato sem vencimento. O multiplier converte contratos em lote (`1000PEPE`). |
| Mapa de liquidação | `liquidationMap` | **Estimativa** de onde posições alavancadas seriam liquidadas. |
| Liquidações reais | `liquidations` | Valores efetivamente liquidados (Coinalyze), em Binance + Bybit + OKX. |
| DCA / compra mensal fixa | `dca.js` | Comparação: o mesmo total em parcelas mensais iguais entre a 1ª e a última compra. |
| Volatilidade histórica | `sigmaDaily` | Desvio padrão dos retornos log diários (até 365 dias). |
| Maker / Taker | `isMaker` | A ordem estava no livro / executou contra o livro. |
| OCO | `orderListId !== -1` | Ordem que faz parte de uma lista (One-Cancels-the-Other). |
| Earn (`LD*`) | `asset.startsWith("LD")` | Saldos do Simple Earn: valem como o ativo sem o prefixo e ficam fora do P&L. |
