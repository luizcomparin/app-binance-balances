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
