---
titulo: Convenções de código e checklists
resumo: Padrões observados no código (server e front) que código novo deve seguir, e checklists para rota, componente, camada do gráfico, storage e evento.
arquivos: [public/core/format.js, public/core/sort.js, public/core/dom.js, public/core/base.css]
rotas: []
eventos: []
storage: []
---

# Convenções

O código existente nem sempre segue estes padrões ([debitos-tecnicos](../debitos-tecnicos.md) lista as exceções). Código **novo** deve seguir o padrão "preferido" de cada item.

## Gerais

- **Idioma:** comentários, textos de interface e mensagens de erro em **PT-BR**. Identificadores (variáveis, funções, arquivos) em inglês. Termos de mercado ficam em inglês quando é assim que o usuário os conhece: P&L, long/short, funding, open interest.
- **Comentários explicam o porquê**, em frases curtas, no topo do arquivo (para que serve, de onde vêm os dados) e antes de blocos não óbvios. Cada arquivo começa com um comentário de 1 a 3 linhas dizendo o que ele faz; mantenha isso.
- **Formatação:** o server usa tabs e o front usa 2 espaços. Aspas duplas, ponto e vírgula, `const`/arrow functions. Não há Prettier nem ESLint configurados: siga o estilo do arquivo.
- **ES modules** dos dois lados, com imports relativos e extensão `.js` explícita.
- **Sem dependências novas** sem combinar antes.

## Server

- **Rota:** valida a entrada em `routes.js` (moeda: `String(req.params.asset).toUpperCase()` + `/^[A-Z0-9]{1,20}$/`; enums: `Set` exportado pelo serviço, como `CHART_INTERVALS` e `FUTURES_PERIODS`) e chama **um** serviço dentro de `handle(() => ...)`.
- **Serviço:** exporta `buildX(...)`, que normalmente é só `cached(key, TTL, () => computeX(...))`. A conta fica em `computeX`, que não é exportada.
- **Falta de dado esperada** (moeda sem perpétuo, sem chave da Coinalyze): responda `{ available: false, reason: "<código-kebab>" }` com 200, sem lançar erro. Documente os `reason` no doc da funcionalidade.
- **Falha parcial** em loops por par: acumule `errors.push({ symbol, error })` e continue. Só relance 429/418 (`if (err.status === 429 || err.status === 418) throw err`).
- **Erro de validação:** `const err = new Error(msg); err.status = 400; throw err;`.
- **Chamadas à Binance spot** passam sempre por `publicGet`/`signedGet`, nunca por `fetch` direto. Concorrência só com `mapLimit(items, 4, fn)`.
- **Respostas** incluem `generatedAt: Date.now()` quando são calculadas.
- **Números** vão como `Number`, nunca strings da Binance. Valores em USDT têm sufixo `USDT` no nome (`totalUSDT`, `avgBuyPriceUSDT`).

## Front

- **Chamada à API:** função nova em `public/api/binance.js`, usando `getJson()`.
- **Estado de carga** de um dado assíncrono: `undefined` = carregando, `null` = erro ou não carregado, valor = pronto (padrão do `view` no gráfico de preço e das tabelas de histórico).
- **Corrida entre respostas:** guarde `requestId`/`asset` antes do `await` e descarte o resultado se mudou (`if (view.asset !== asset) return;`).
- **Eventos:** prefira `addEventListener` no `init*()` a `onclick` inline. Para listas, use delegação (um listener no container + `e.target.closest(...)`).
- **`localStorage`:** sempre com `try/catch` na leitura e na escrita, e com valor padrão quando faltar. Registre a chave em [armazenamento-local](../referencia/armazenamento-local.md).
- **Formatação de números:** `formatPrice` (preço), `formatQty` (quantidade), `formatSigned` (P&L com sinal), `signClass` (cor) e `v.toFixed(2).formatCurrency()` (valor em USDT/BRL com 2 casas).
- **HTML com texto vindo de fora** (mensagem de erro do server, nomes vindos da API): escape antes de colocar em `innerHTML` com `escapeHtml` de `public/core/dom.js`.
- **Spinner inline:** `<span class="mini-spinner"></span> Carregando...`. Estado de checkbox carregando ou indisponível: classes `is-loading` / `disabled` no `<label>` (ver `update*Availability` em `PriceChartPanel.js`).

## Checklists

### Nova rota

1. Serviço em `server/services/<x>.js` (com `cached` se chamar API externa).
2. Rota em `server/routes.js`: validação + `handle`.
3. Se for relevante, acrescente na lista impressa por `app.listen` em `server.js`.
4. Função em `public/api/binance.js` usando `getJson`.
5. Docs: [api.md](../referencia/api.md), [cache.md](../referencia/cache.md) se tiver TTL, e o doc da funcionalidade (cabeçalho `rotas:`).

### Novo componente

1. `public/components/<pasta>/<Nome>.html|.css|.js`.
2. Slot `<div data-component="components/<pasta>/<Nome>.html"></div>` em `AppShell.html`.
3. `@import` em `public/index.css`.
4. `import { initNome } ...` e a chamada em `public/index.js`, **antes** de `initTabs()`.
5. Se for uma aba nova: botão em `Tabs.html` com `data-tab` e `data-slug`, e `<section class="card tab-panel" data-tab="...">`. Ver [abas-e-navegacao](../funcionalidades/abas-e-navegacao.md).
6. Doc novo em `docs/funcionalidades/` e uma linha no `AGENTS.md` e no `docs/README.md`.

### Nova camada no gráfico de preço

Ver [grafico-de-preco/README](../funcionalidades/grafico-de-preco/README.md#como-adicionar-uma-camada).

### Nova chave de `localStorage`

1. Constante `X_STORAGE_KEY` no módulo dono.
2. Leitura e escrita com `try/catch` e valor padrão.
3. Linha em [armazenamento-local](../referencia/armazenamento-local.md).

### Novo evento

1. Constante exportada em `public/core/events.js`, com um comentário dizendo o que vem no `detail`.
2. Linha em [eventos-e-estado](../referencia/eventos-e-estado.md) (quem emite e quem escuta).

### Toda mudança

- Atualize o cabeçalho YAML e o corpo do doc da funcionalidade no mesmo commit.
- Verifique manualmente (seção "Como verificar" do doc) e diga o que foi testado.
