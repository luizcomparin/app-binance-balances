# Documentação — índice

Documentação oficial do app. Comece pelo [AGENTS.md](../AGENTS.md), que traz as regras e a tabela "quero mexer em… → leia…". Este índice lista **todos** os docs e, no fim, mostra **cada arquivo de código → doc que o cobre**.

## Como a documentação está organizada

| Pasta | Conteúdo | Quando ler |
|---|---|---|
| `arquitetura/` | Como as partes se encaixam, camadas e convenções | Antes de criar algo novo |
| `referencia/` | Catálogos: rotas, eventos, `localStorage`, caches, APIs externas, configuração, glossário | Para consultar um detalhe exato |
| `funcionalidades/` | Um doc por funcionalidade, sempre com **os dois lados** (página e server) | Antes de alterar uma funcionalidade |
| `funcionalidades/grafico-de-preco/` | O gráfico de preço, dividido por subfuncionalidade | Idem |
| `decisoes.md` | Comportamentos intencionais que parecem "errados" | Antes de "corrigir" algo |
| `debitos-tecnicos.md` | Duplicações, padrões inconsistentes, bugs suspeitos | Ao planejar refatorações |
| `backlog/` | Ideias avaliadas e não implementadas | Ao planejar funcionalidades |
| `historico/` | Documentos antigos, **desatualizados** | Só por curiosidade |

### Cabeçalho dos docs

Os docs de funcionalidade e de arquitetura começam com um cabeçalho YAML que dá para buscar com grep:

```yaml
---
titulo: Saldos e P&L
resumo: uma frase
arquivos: [caminhos relativos à raiz]   # código coberto por este doc
rotas: [GET /positions]                 # rotas HTTP envolvidas
eventos: [POSITIONS_UPDATED]            # eventos do front (core/events.js)
storage: [balances-simple-view]         # chaves de localStorage
---
```

Exemplos de busca:

- `grep -rl "services/positions.js" docs/`: qual doc cobre o arquivo.
- `grep -rl "POSITIONS_UPDATED" docs/`: quem documenta o evento.

### Modelo de doc de funcionalidade

As seções aparecem sempre nesta ordem; quando uma não se aplica, ela é omitida.

1. **O que faz:** visão de quem usa.
2. **Página (front):** arquivos, funções principais e ids do DOM.
3. **Server:** rota → serviço → fontes externas.
4. **Fluxo de dados:** passo a passo de front ↔ server.
5. **Regras de negócio e fórmulas.**
6. **Cache e estado persistido.**
7. **Casos de borda e armadilhas.**
8. **Checklist ao alterar.**
9. **Como verificar:** teste manual.

## Todos os docs

**Arquitetura**
- [arquitetura/visao-geral.md](arquitetura/visao-geral.md): stack, boot dos dois lados, caminho de uma requisição, contrato de erro.
- [arquitetura/server.md](arquitetura/server.md): camadas do server e responsabilidades de cada pasta.
- [arquitetura/frontend.md](arquitetura/frontend.md): AppShell, componentes html/css/js, `window.*`, eventos, ciclo de carga.
- [arquitetura/convencoes.md](arquitetura/convencoes.md): padrões de código e checklists (rota, componente, camada, storage).

**Referência**
- [referencia/api.md](referencia/api.md): todas as rotas HTTP: parâmetros, validação, resposta, erros, serviço e quem consome.
- [referencia/eventos-e-estado.md](referencia/eventos-e-estado.md): o `state` compartilhado e os eventos (quem emite e quem escuta).
- [referencia/armazenamento-local.md](referencia/armazenamento-local.md): todas as chaves de `localStorage`.
- [referencia/cache.md](referencia/cache.md): todos os caches e TTLs (server e front).
- [referencia/integracoes-externas.md](referencia/integracoes-externas.md): Binance spot, Binance Futures, Coinalyze e CDNs.
- [referencia/configuracao-e-seguranca.md](referencia/configuracao-e-seguranca.md): `.env`, chaves, CORS e proteções.
- [referencia/glossario.md](referencia/glossario.md): termos de domínio usados no código e na interface.

**Funcionalidades**
- [funcionalidades/carteira-e-cards.md](funcionalidades/carteira-e-cards.md): `/balances`, cards do topo, faixa de ativos, topbar.
- [funcionalidades/saldos-e-pnl.md](funcionalidades/saldos-e-pnl.md): aba Saldos, `/positions`, custo médio e P&L.
- [funcionalidades/graficos-de-distribuicao.md](funcionalidades/graficos-de-distribuicao.md): rosca, barras, P&L por moeda, custo vs. valor.
- [funcionalidades/ordens-abertas.md](funcionalidades/ordens-abertas.md): aba Ordens Abertas, agrupamento por par, simulação.
- [funcionalidades/ordens-executadas.md](funcionalidades/ordens-executadas.md): aba Ordens Executadas.
- [funcionalidades/simulacao-de-valorizacao.md](funcionalidades/simulacao-de-valorizacao.md): modal "Simular Valorização".
- [funcionalidades/configuracoes.md](funcionalidades/configuracoes.md): modal Configurações (chaves Binance e Coinalyze).
- [funcionalidades/abas-e-navegacao.md](funcionalidades/abas-e-navegacao.md): abas, URL `/site/<slug>`, Voltar/Avançar.

**Gráfico de preço**
- [grafico-de-preco/README.md](funcionalidades/grafico-de-preco/README.md): visão do módulo, `view`, `render()`, mapa de arquivos.
- [grafico-de-preco/velas-e-timeframe.md](funcionalidades/grafico-de-preco/velas-e-timeframe.md): `/price-chart`, período × vela, histórico antigo, fuso.
- [grafico-de-preco/sobreposicoes-e-legenda.md](funcionalidades/grafico-de-preco/sobreposicoes-e-legenda.md): linhas de preço, marcadores, legenda, tooltip.
- [grafico-de-preco/indicadores.md](funcionalidades/grafico-de-preco/indicadores.md): SMA/EMA, Bollinger, média do volume.
- [grafico-de-preco/desenhos-e-regua.md](funcionalidades/grafico-de-preco/desenhos-e-regua.md): ferramentas de desenho e régua.
- [grafico-de-preco/simulador-e-projecoes.md](funcionalidades/grafico-de-preco/simulador-e-projecoes.md): médios projetados e simulador de compra.
- [grafico-de-preco/faixa-estatistica.md](funcionalidades/grafico-de-preco/faixa-estatistica.md): volatilidade, faixa ±σ, chance de tocar.
- [grafico-de-preco/comparacao-dca.md](funcionalidades/grafico-de-preco/comparacao-dca.md): suas compras vs. compra mensal fixa.
- [grafico-de-preco/mapa-de-liquidacao.md](funcionalidades/grafico-de-preco/mapa-de-liquidacao.md): `/liquidation-map`, modelo e desenho.
- [grafico-de-preco/paineis-de-futuros.md](funcionalidades/grafico-de-preco/paineis-de-futuros.md): `/futures-data` e painéis de volume, CVD, OI, L/S e funding.
- [grafico-de-preco/rsi.md](funcionalidades/grafico-de-preco/rsi.md): painel do RSI, fórmula e configurações.
- [grafico-de-preco/macd.md](funcionalidades/grafico-de-preco/macd.md): painel do MACD, fórmula e configurações.
- [grafico-de-preco/liquidacoes-reais.md](funcionalidades/grafico-de-preco/liquidacoes-reais.md): `/liquidations` (Coinalyze).
- [grafico-de-preco/watchlist-e-seletor.md](funcionalidades/grafico-de-preco/watchlist-e-seletor.md): lista lateral e seletor do título.
- [grafico-de-preco/abas-de-ordens.md](funcionalidades/grafico-de-preco/abas-de-ordens.md): ordens abertas, histórico de ordens e de trades.

**Outros**
- [decisoes.md](decisoes.md) · [debitos-tecnicos.md](debitos-tecnicos.md) · [backlog/ideias-futuras.md](backlog/ideias-futuras.md) · [historico/analise-2026-11-18.md](historico/analise-2026-11-18.md) (desatualizado)

## Arquivo → doc

| Arquivo | Doc |
|---|---|
| `server.js` | [visao-geral](arquitetura/visao-geral.md), [abas-e-navegacao](funcionalidades/abas-e-navegacao.md) |
| `server/config.js` | [configuracao-e-seguranca](referencia/configuracao-e-seguranca.md), [configuracoes](funcionalidades/configuracoes.md) |
| `server/routes.js` | [api](referencia/api.md) |
| `server/lib/cache.js` | [cache](referencia/cache.md), [server](arquitetura/server.md) |
| `server/binance/client.js` | [integracoes-externas](referencia/integracoes-externas.md) |
| `server/binance/account.js` | [integracoes-externas](referencia/integracoes-externas.md), [saldos-e-pnl](funcionalidades/saldos-e-pnl.md) |
| `server/binance/market.js` | [integracoes-externas](referencia/integracoes-externas.md), [carteira-e-cards](funcionalidades/carteira-e-cards.md) |
| `server/binance/futures.js` | [paineis-de-futuros](funcionalidades/grafico-de-preco/paineis-de-futuros.md), [mapa-de-liquidacao](funcionalidades/grafico-de-preco/mapa-de-liquidacao.md) |
| `server/coinalyze/client.js` | [liquidacoes-reais](funcionalidades/grafico-de-preco/liquidacoes-reais.md) |
| `server/services/wallet.js` | [carteira-e-cards](funcionalidades/carteira-e-cards.md) |
| `server/services/positions.js`, `positionMath.js`, `tradeHistory.js` | [saldos-e-pnl](funcionalidades/saldos-e-pnl.md) |
| `server/services/openOrders.js` | [ordens-abertas](funcionalidades/ordens-abertas.md) |
| `server/services/executedOrders.js` | [ordens-executadas](funcionalidades/ordens-executadas.md) |
| `server/services/priceChart.js` | [velas-e-timeframe](funcionalidades/grafico-de-preco/velas-e-timeframe.md) |
| `server/services/orderHistory.js`, `assetTrades.js` | [abas-de-ordens](funcionalidades/grafico-de-preco/abas-de-ordens.md) |
| `server/services/liquidationMap.js` | [mapa-de-liquidacao](funcionalidades/grafico-de-preco/mapa-de-liquidacao.md) |
| `server/services/futuresData.js` | [paineis-de-futuros](funcionalidades/grafico-de-preco/paineis-de-futuros.md) |
| `server/services/liquidations.js` | [liquidacoes-reais](funcionalidades/grafico-de-preco/liquidacoes-reais.md) |
| `server/services/apiKeySettings.js`, `coinalyzeKeySettings.js` | [configuracoes](funcionalidades/configuracoes.md) |
| `public/index.html`, `index.js`, `index.css` | [frontend](arquitetura/frontend.md) |
| `public/api/binance.js` | [api](referencia/api.md), [frontend](arquitetura/frontend.md) |
| `public/core/state.js`, `events.js` | [eventos-e-estado](referencia/eventos-e-estado.md) |
| `public/core/positions.js` | [saldos-e-pnl](funcionalidades/saldos-e-pnl.md) |
| `public/core/format.js`, `sort.js`, `dom.js`, `base.css` | [convencoes](arquitetura/convencoes.md) |
| `public/core/pairCombo.js` | [ordens-abertas](funcionalidades/ordens-abertas.md) |
| `public/components/app/*` | [frontend](arquitetura/frontend.md) |
| `public/components/tabs/*` | [abas-e-navegacao](funcionalidades/abas-e-navegacao.md) |
| `public/components/topbar/*`, `stats/*`, `asset-strip/*` | [carteira-e-cards](funcionalidades/carteira-e-cards.md) |
| `public/components/balances/*` | [saldos-e-pnl](funcionalidades/saldos-e-pnl.md) |
| `public/components/charts/*` | [graficos-de-distribuicao](funcionalidades/graficos-de-distribuicao.md) |
| `public/components/orders/*` | [ordens-abertas](funcionalidades/ordens-abertas.md) |
| `public/components/executed/*` | [ordens-executadas](funcionalidades/ordens-executadas.md) |
| `public/components/simulation/*` | [simulacao-de-valorizacao](funcionalidades/simulacao-de-valorizacao.md) |
| `public/components/settings/*` | [configuracoes](funcionalidades/configuracoes.md) |
| `public/components/price-chart/**` | [grafico-de-preco/README](funcionalidades/grafico-de-preco/README.md) (com o mapa arquivo → subdoc) |
