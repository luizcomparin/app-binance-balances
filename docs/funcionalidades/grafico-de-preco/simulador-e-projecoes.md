---
titulo: Simulador de compra e preços médios projetados
resumo: Camadas "Preço médio após ordens abertas" (linhas após compras e após vendas abertas) e "Simular compra até o preço médio" (quanto comprar para o médio chegar no preço sob o mouse).
arquivos: [public/components/price-chart/buySimulator.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/chartData.js]
rotas: [GET /positions, GET /orders/:asset]
eventos: [POSITIONS_UPDATED]
storage: [priceChartProjectedAvg]
---

# Simulador de compra e médios projetados

São dois checkboxes em ⚙ (`#price-chart-layers`).

## Preço médio após ordens abertas (`#price-chart-projected`)

Um único checkbox (`view.showProjected`) liga as duas linhas abaixo. No gráfico e na legenda, cada linha continua separada e só aparece quando se aplica à moeda.

- O checkbox fica disponível se ao menos uma das linhas se aplica. Enquanto carrega, mostra spinner; sem dados, fica desabilitado com explicação no `title` (`updateProjectedAvailability`).

### Linha: médio após compras abertas

- Fórmula: `avgAfterBuys({ avg, qty }, buys) = (Q·A + Σ qtdᵢ·preçoᵢ) / (Q + Σ qtdᵢ)`, sem taxas.
- `A` e `Q` vêm de `state.positions[asset]` (o médio dinâmico e a quantidade do saldo). `buys` vêm das ordens abertas de compra convertidas para USDT (`chartData.loadOpenOrders`).
- Só aparece com preço médio calculado **e** compras abertas.
- Também entra na faixa estatística ("chance de tocar o médio após compras abertas").

### Linha: médio após vendas abertas

- Fórmula: `avgAfterSells({ avgSell: V, soldQty: S }, sells) = (S·V + Σ qtdᵢ·preçoᵢ) / (S + Σ qtdᵢ)`, onde `S` = `soldQtyCycle`. Sem vendas no ciclo, é a média das vendas abertas.
- Só aparece quando há vendas abertas.

## Simular compra até o preço médio (`#price-chart-sim`)

- Com a opção ligada, o tooltip passa a mostrar, para o **preço sob o mouse** (alvo `T`), quanto comprar ao preço atual `P` para o médio ir de `A` até `T`:
  `X (USDT) = Q·P·(T − A) / (P − T)`. Só é possível se `T` estiver estritamente entre `A` e `P` (`buyToReachAvg`).
- A caixa (`simBox`) mostra "Comprar ≈ X USDT (q MOEDA a P)" ou "Inalcançável comprando a preço atual". O status `ok | unreachable | none` vira a classe CSS do tooltip.
- `setSimContext({ asset, lastPrice })` é atualizado a cada carga de velas. O crosshair está em modo livre (`CrosshairMode.Normal`) para dar o preço exato.
- Esta opção **não** é persistida. `updateSimAvailability()` a desliga se não houver preço médio.

## Persistência

`priceChartProjectedAvg` (um valor para as duas linhas).

## Como verificar

Numa moeda com posição e ordens de compra abertas:

1. Ligue "Preço médio após ordens abertas": aparece a linha roxa (e a branca, se houver vendas abertas), com seus itens na legenda.
2. Ligue o simulador e passe o mouse entre o médio e o preço atual: a caixa mostra o valor a comprar.
