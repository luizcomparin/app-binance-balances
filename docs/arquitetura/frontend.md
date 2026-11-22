---
titulo: Arquitetura do front (página web)
resumo: Página única montada pelo AppShell a partir de componentes html/css/js, comunicação por eventos e state, chamadas em api/binance.js.
arquivos: [public/index.html, public/index.js, public/index.css, public/api/binance.js, public/core/dom.js, public/components/app/AppShell.html, public/components/app/AppShell.js, public/components/app/AppShell.css]
rotas: []
eventos: [BALANCES_UPDATED, POSITIONS_UPDATED, TAB_CHANGED, COINALYZE_KEY_CHANGED]
storage: []
---

# Front

## Montagem da página

- `public/index.html` carrega `index.css`, Chart.js e Lightweight Charts (CDN), um único slot `<div data-component="components/app/AppShell.html">` e `index.js` como módulo.
- `AppShell.js` → `loadComponents()`: busca o HTML de cada `[data-component]` e o coloca no lugar do slot (`outerHTML`). A busca é **recursiva**, porque o `AppShell.html` tem outros slots. Os componentes são todos montados **antes** de qualquer `init*()`.
- Ordem dos slots em `AppShell.html`: overlay de loading, Topbar, StatGrid, AssetStrip, Tabs, ChartsPanel, BalancesPanel, PriceChartPanel, OrdersPanel, ExecutedOrdersPanel, SimulationModal, SettingsModal.
- `public/index.css` faz só `@import` de `core/base.css` e do CSS de cada componente. CSS de componente novo **precisa** entrar aqui.

## Componente = trio html/css/js

```
public/components/<pasta>/
  Nome.html   marcação estática (ids estáveis usados pelo JS)
  Nome.css    estilos (importado em public/index.css)
  Nome.js     export initNome() + funções de carga/render
```

- Os painéis de aba são `<section class="card tab-panel" data-tab="<nome>">`. O `Tabs.js` alterna a classe `active`.
- O JS acha os elementos por `id` (`document.getElementById`). Os ids de cada funcionalidade estão listados no doc dela.
- O render é feito com **template strings em `innerHTML`**. Não há virtual DOM: cada render substitui o conteúdo.
- Os eventos são ligados de dois jeitos (inconsistente, ver débitos):
  - `onclick="fn()"` no HTML, chamando funções expostas em `window.*` por `index.js`. É usado no "Simular Valorização" do Topbar, cabeçalhos de ordenação das tabelas, botões Recarregar e na Simulação.
  - `addEventListener` no `init*()`. É o padrão nos componentes mais novos (gráfico de preço, Configurações, Ordens).

## Comunicação entre componentes

Os componentes não chamam o render uns dos outros. Eles usam:

1. **`core/state.js`:** objeto mutável compartilhado (saldos, posições, ordens filtradas…).
2. **`core/events.js`:** `emit(name, detail)` e `on(name, handler)`, implementados sobre `window.dispatchEvent(CustomEvent)`.
3. Exceções diretas: `window.openPriceChart(asset)` (qualquer lugar pode abrir o gráfico de preço) e `openSettings("coinalyze")` (importado pelo gráfico de preço).

O catálogo completo está em [eventos-e-estado](../referencia/eventos-e-estado.md). O fluxo principal é:

```
loadBalances() ── fetch /balances ──► state.currentAssets ──► emit(BALANCES_UPDATED, data)
     │                                                         ├─ StatGrid, AssetStrip, ChartsPanel
     │                                                         ├─ orderSimulation, watchlist do gráfico
     └─ loadPositions() ── fetch /positions ──► state.positions ──► emit(POSITIONS_UPDATED)
                                                                   ├─ BalancesPanel (mescla P&L na tabela)
                                                                   ├─ pnlCharts
                                                                   └─ PriceChartPanel (preço médio)
```

## `public/api/binance.js`

É o único lugar que faz `fetch` para a API local. Os componentes do gráfico de preço não chamam `api/binance.js` direto: passam por `chartData.js`, que tem um cache no cliente.

- `apiFetch(url)`: em **erro de rede** (o server reiniciando pelo nodemon), tenta de novo a cada 500 ms por até 15 s. Respostas HTTP de erro voltam normalmente.
- `getJson(url)`: `apiFetch` + `res.json()` e lança `Error(json.error)` quando `!res.ok` ou quando existe `json.error`. É o padrão das funções novas.
- Todas as funções de leitura usam `getJson`, então um erro da API (sem chave, falha na Binance) chega como exceção com a mensagem do server.
- `saveApiKey` e `saveCoinalyzeKey` usam `fetch` direto (sem retry), com POST JSON.

O mapa função → rota está em [api](../referencia/api.md).

## Utilitários de `core/`

| Arquivo | Para quê |
|---|---|
| `format.js` | **Estende `String.prototype` e `Number.prototype` com `formatCurrency()`** (2 casas, pt-BR). Também exporta `formatPrice` (casas adaptativas), `formatQty`, `formatSigned`, `formatPct`, `signClass` (`pnl-pos`/`pnl-neg`), `formatUsdShort` ("100,6M") e `formatDateTime`. É importado primeiro em `index.js` por causa do efeito colateral. |
| `dom.js` | `showLoading`, `hideLoading`, `setText`, `setHtml` (ignoram id inexistente). |
| `sort.js` | `toggleSort(state, key)` (mesma coluna inverte; coluna nova começa decrescente) e `compareValues`. |
| `pairCombo.js` | Campo de busca de par com lista (teclado ↑ ↓ Enter Esc), usado em Ordens Abertas e Executadas. |
| `positions.js` | `loadPositions()`: carga única compartilhada de `/positions` → `state` + `POSITIONS_UPDATED`. |
| `base.css` | Variáveis de cor (`--bg`, `--card`, `--text`, `--muted`, `--accent`…), layout, tabelas, botões (`.pc-btn`, `.pc-chip`), `.filter-bar`, `.pair-combo`, `.pnl-pos/.pnl-neg`. |

Classes usadas em todo o app ficam em `core/base.css`: `.help-tip` (dica no hover via `data-tip`), `.mini-spinner`, `.asset-link` e a animação `spin`. As variações de contexto (dica que abre para cima nos painéis do gráfico, tamanho do spinner em cada caixa) ficam no CSS do componente, com seletores mais específicos.

## Estilo visual

- Tema escuro único (`--bg #0b1021`), fonte Manrope (Google Fonts, importada em `base.css`).
- As cores dos gráficos estão **fixas no JS** (Chart.js e Lightweight Charts não leem variáveis CSS): `charts/chartUtils.js`, `price-chart/chart/overlays.js` (`COLORS`) e `chart/futuresPanes.js` (`COLORS`).
- Dicas de ajuda: `<span class="help-tip" data-tip="texto&#10;com quebra">`.
