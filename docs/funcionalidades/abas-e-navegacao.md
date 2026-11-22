---
titulo: Abas e navegação por URL
resumo: As cinco abas do dashboard, cada uma com URL própria (/site/<slug>), histórico do navegador e evento TAB_CHANGED.
arquivos: [public/components/tabs/Tabs.js, public/components/tabs/Tabs.html, public/components/tabs/Tabs.css, server.js]
rotas: [GET /site, GET /site/:page]
eventos: [TAB_CHANGED]
storage: []
---

# Abas e navegação

## O que faz

Há cinco abas, cada uma com uma URL própria. F5, link direto, Voltar e Avançar funcionam.

| Aba | `data-tab` | URL (`data-slug`) |
|---|---|---|
| Gráfico de preço | `price-chart` | `/site/grafico-de-preco` (**padrão**, `active` no HTML) |
| Gráficos de Distribuição | `charts` | `/site/graficos-de-distribuicao` |
| Saldos por moeda | `balances` | `/site/saldos` |
| Ordens Abertas | `orders` | `/site/ordens-abertas` |
| Ordens Executadas | `executed` | `/site/ordens-executadas` |

## Página

- `Tabs.html` tem os botões `.tab` com `data-tab` e `data-slug`. Cada painel é um `<section class="tab-panel" data-tab="...">` no próprio componente.
- `Tabs.js`:
  - `showTab(name, { history: "push"|"replace"|"none" })` alterna a classe `active` em botões e painéis e atualiza a URL (`pushState`/`replaceState`, preservando `search` e `hash`). Só emite `TAB_CHANGED` quando a aba muda.
  - `isTabActive(name)`.
  - `initTabs()`, chamada **por último** no boot: abre a aba da URL (ou a `.active` do HTML) com `replace` e liga os cliques e o `popstate`.
- Quem reage a `TAB_CHANGED`: ExecutedOrdersPanel (carga preguiçosa) e PriceChartPanel (abre a moeda inicial e redesenha).

## Server

`server.js` serve `index.html` em `GET /site` e em `GET /site/:page` (slug `[a-z0-9-]+`). Os arquivos estáticos também ficam em `/site/*`, então os caminhos relativos do HTML funcionam nas duas URLs.

## Checklist para uma aba nova

1. Botão em `Tabs.html` (`data-tab`, `data-slug` com slug `[a-z0-9-]+`).
2. `<section class="card tab-panel" data-tab="...">` no componente.
3. Se a carga for preguiçosa, escute `TAB_CHANGED`.
4. Atualize a tabela acima.

## Como verificar

1. Clique em cada aba: a URL muda.
2. Dê F5: a mesma aba reabre.
3. Use Voltar e Avançar.
