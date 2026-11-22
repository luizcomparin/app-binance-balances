---
titulo: Simulação de valorização (modal)
resumo: Modal aberto pelo botão "Simular Valorização" do topo; a pessoa informa uma variação % por moeda e vê o valor estimado da carteira.
arquivos: [public/components/simulation/SimulationModal.js, public/components/simulation/SimulationModal.html, public/components/simulation/SimulationModal.css]
rotas: []
eventos: []
storage: []
---

# Simulação de valorização

## O que faz

O botão **Simular Valorização** (Topbar) abre um modal. Nele há um campo de % para cada moeda da carteira (ex.: `10` = +10%, `-5` = −5%), uma busca por nome de moeda e o resultado "Valor estimado da carteira", recalculado a cada digitação.

É diferente da simulação de **ordens** da aba Ordens Abertas ([ordens-abertas](ordens-abertas.md)) e do **simulador de compra** do gráfico de preço ([simulador-e-projecoes](grafico-de-preco/simulador-e-projecoes.md)).

## Página

- `SimulationModal.js`:
  - `openSimulationDialog()` (`window`, via `onclick`): sem saldos carregados, mostra `alert("Carregue a carteira primeiro.")`. Senão, monta um `<input id="sim-<MOEDA>">` para cada item de `state.currentAssets`, liga os listeners e exibe o modal (`style.display = "flex"`).
  - `calculateSimulation()`: `Σ totalUSDT × (1 + %/100)`.
  - `filterAssets()` esconde as linhas que não batem com a busca.
  - `closeSimulationDialog()` (`window`, botão ×).
- Ids: `#simulation-modal`, `#simulation-inputs`, `#simulation-search`, `#simulation-result`.

Não usa server nem eventos: lê `state.currentAssets` no momento em que abre.

## Casos de borda e armadilhas

- A cada abertura, um **novo** listener `input` é adicionado em `#simulation-search` (acumula; ver débitos).
- Os ids `sim-<MOEDA>` dividem o prefixo com `#sim-sells`, `#sim-buys`, `#sim-usdt` e `#sim-total` da simulação de ordens. Hoje não colidem só porque os ids diferenciam maiúsculas de minúsculas.
- Não fecha com Esc nem com clique fora (o modal de Configurações fecha). Usa `style.display`, enquanto Configurações usa o atributo `hidden`.

## Como verificar

1. Carregue a carteira e clique em "Simular Valorização".
2. Digite `10` em uma moeda: o total sobe 10% do valor dela.
3. Busque uma moeda e feche pelo ×.
