---
titulo: Comparação com compra mensal fixa (DCA)
resumo: Camada que compara o preço médio fixo das suas compras com o de ter investido o mesmo total em parcelas mensais iguais entre a primeira e a última compra.
arquivos: [public/components/price-chart/dca.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/chartData.js]
rotas: [GET /executed-orders, GET /price-chart/:asset]
eventos: []
storage: [priceChartDca]
---

# Comparação com compra mensal fixa (DCA)

## O que faz

O checkbox `#price-chart-dca` responde à pergunta: "se o total que investi nesta moeda tivesse sido dividido em parcelas mensais iguais entre minha primeira e minha última compra, qual seria o preço médio?"

- No gráfico, aparecem as linhas **Preço médio fixo** (média de todas as suas compras, ignorando as vendas) e **Médio mensal fixo**.
- A caixa `#price-chart-dca-box` mostra:
  - o total investido, o número de parcelas e o valor de cada uma;
  - as duas médias;
  - o veredito: "Suas compras saíram x% mais baratas/caras" (empate se a diferença for menor que 0,05%);
  - a quantidade comprada vs. a do automático.

## Cálculo (`dca.js`, funções puras)

- `buysOf(myOrders, asset)`: as suas ordens executadas de **compra** da moeda (de `/executed-orders`).
- `monthlyDates(start, end)`: mesmo dia do mês, ajustado em meses mais curtos.
- `dcaComparison(buys, dailyPoints)`:
  - `yourAvg = Σ totalUSDT / Σ qty`;
  - parcelas = `invested / meses`;
  - preço de cada parcela = fechamento diário da data (`closeAt`, busca binária);
  - `diffPct = (yourAvg − dcaAvg) / dcaAvg × 100`, onde negativo significa que você comprou melhor.
  - Com menos de 2 datas mensais, devolve `{ tooShort }`. Se o histórico não cobre as datas, devolve `null`.

## Dados (`PriceChartPanel.loadDca`)

1. `loadMyOrders()`.
2. Pagina velas diárias para trás até cobrir a primeira compra.
3. `view.dca` recebe o resultado, `{ empty: "buys" | "history" }` ou `null` (erro).

## Casos de borda

- Só considera moedas em carteira, porque `/executed-orders` só cobre essas.
- Compras dentro de menos de 1 mês: mostra a mensagem de "não dá para comparar".

## Como verificar

Numa moeda com compras ao longo de vários meses, ligue a camada: aparecem duas linhas e o veredito.
