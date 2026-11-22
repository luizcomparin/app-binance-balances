---
titulo: Simulador de compra e preços médios projetados
resumo: Camadas "Preço médio após compras/vendas abertas" e "Simular compra até o preço médio" (quanto comprar para o médio chegar no preço sob o mouse).
arquivos: [public/components/price-chart/buySimulator.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/chartData.js]
rotas: [GET /positions, GET /orders/:asset]
eventos: [POSITIONS_UPDATED]
storage: [priceChartProjectedAvg, priceChartProjectedSellAvg]
---

# Simulador de compra e médios projetados

São três checkboxes em ⚙ (`#price-chart-layers`).

## Preço médio após compras abertas (`#price-chart-projected`)

- Fórmula: `avgAfterBuys({ avg, qty }, buys) = (Q·A + Σ qtdᵢ·preçoᵢ) / (Q + Σ qtdᵢ)`, sem taxas.
- `A` e `Q` vêm de `state.positions[asset]` (o médio dinâmico e a quantidade do saldo). `buys` vêm das ordens abertas de compra convertidas para USDT (`chartData.loadOpenOrders`).
- Só fica disponível com preço médio calculado **e** compras abertas. Enquanto carrega, mostra spinner; sem dados, fica desabilitado com explicação no `title` (`updateProjectedAvailability`).
- Também entra na faixa estatística ("chance de tocar o médio após compras abertas").

## Preço médio após vendas abertas (`#price-chart-projected-sell`)

- Fórmula: `avgAfterSells({ avgSell: V, soldQty: S }, sells) = (S·V + Σ qtdᵢ·preçoᵢ) / (S + Σ qtdᵢ)`, onde `S` = `soldQtyCycle`. Sem vendas no ciclo, é a média das vendas abertas.
- Fica disponível quando há vendas abertas (`updateProjectedSellAvailability`).

## Simular compra até o preço médio (`#price-chart-sim`)

- Com a opção ligada, o tooltip passa a mostrar, para o **preço sob o mouse** (alvo `T`), quanto comprar ao preço atual `P` para o médio ir de `A` até `T`:
  `X (USDT) = Q·P·(T − A) / (P − T)`. Só é possível se `T` estiver estritamente entre `A` e `P` (`buyToReachAvg`).
- A caixa (`simBox`) mostra "Comprar ≈ X USDT (q MOEDA a P)" ou "Inalcançável comprando a preço atual". O status `ok | unreachable | none` vira a classe CSS do tooltip.
- `setSimContext({ asset, lastPrice })` é atualizado a cada carga de velas. O crosshair está em modo livre (`CrosshairMode.Normal`) para dar o preço exato.
- Esta opção **não** é persistida. `updateSimAvailability()` a desliga se não houver preço médio.

## Persistência

`priceChartProjectedAvg` e `priceChartProjectedSellAvg`.

## Como verificar

Numa moeda com posição e ordens de compra abertas:

1. Ligue "após compras abertas": aparece a linha roxa e o item na legenda.
2. Ligue o simulador e passe o mouse entre o médio e o preço atual: a caixa mostra o valor a comprar.
