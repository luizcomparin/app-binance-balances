# Débitos técnicos

Este é o registro de **código duplicado, padrões inconsistentes, lógicas potencialmente quebradas e melhorias de infraestrutura** encontrados na leitura completa do código em 22/11/2026. **Nada aqui foi corrigido.** É uma lista para planejar refatorações.

**Regras:**

- Não corrija um item "de carona" numa tarefa que não é sobre ele (escopo estrito).
- Ao corrigir um item, **remova-o daqui** no mesmo commit.
- Ao encontrar um débito novo, adicione-o na seção certa.
- Antes de "corrigir", confira se não é uma escolha registrada em [decisoes.md](decisoes.md).

Severidade: **Alta** = pode mostrar número errado ou quebrar uma funcionalidade · **Média** = comportamento estranho em casos específicos ou risco ao evoluir · **Baixa** = limpeza ou consistência.

## Bugs e lógicas potencialmente quebradas

| # | Sev. | Onde | Problema | Cenário | Sugestão |
|---|---|---|---|---|---|
| B14 | Baixa | `chart/createChart.js` (barra `.lwc-topbar`) e `chart/chart.css` | A barra da legenda fica por cima do topo do gráfico e cobre a parte dentro do gráfico (título) da etiqueta de uma linha de preço que cai bem no topo, como uma ordem de venda aberta logo abaixo do limite da escala. O valor no eixo continua visível | Moeda com muitas camadas e legenda em 2 ou mais linhas: o título "V 0,00033 · 49,30 USDT" fica meio apagado atrás da legenda | Limitar a largura da barra para não alcançar a borda direita do gráfico, ou reservar margem no topo da escala (`scaleMargins.top`) do tamanho da legenda |
| B15 | Baixa | `server/services/futuresData.js` | `FUNDING_LIMIT = 1000` (comentado como "~333 dias"), mas `/futures-data` devolve só **500** cobranças de funding (cerca de 166 dias com funding a cada 8 h). Visto em 26/11/2026 em BTC e SUI; a causa não foi investigada (limite da fapi ou do pedido) | O painel de funding e o sinal de funding ([sinais](sinais/README.md)) têm metade do histórico que os docs dizem | Conferir o limite real do endpoint `/fapi/v1/fundingRate` e, se for 500 por chamada, paginar com `startTime` ou corrigir a constante e os docs ([paineis-de-futuros](funcionalidades/grafico-de-preco/paineis-de-futuros.md)) |
| B9 | Baixa | `server/services/orderHistory.js` | `allOrders` traz só as **últimas 1000 ordens por par**, sem paginação | Conta com muitas ordens num par: o histórico antigo some | Paginar por `orderId` |

## Código replicado

| # | Onde | Duplicação | Sugestão |
|---|---|---|---|
| D1 | `chartData.ordersOnChart`, `dca.closeAt`, `createChart.timeToX`, `futuresPanes.barIndex`, `drawings.msToIdx`, `measureTool.indexOf` | **6 buscas binárias** "última vela com time ≤ t" | `lastIndexAtOrBefore(points, t)` num util do gráfico |
| D2 | `PriceChartPanel` (`readStored/writeStored`), `watchlist` (`read/write`), `BalancesPanel`, `OrdersPanel`, `indicatorControls`, `drawings`, `drawingToolbar`, `futuresPanes` | 8 implementações de leitura e escrita de `localStorage` com `try/catch` e parse JSON | `core/storage.js` com `getItem/setItem/getJSON/setJSON` |
| D3 | `orderHistoryTable.js` × `tradeHistoryTable.js` | Mesma estrutura de estado (`undefined/null/lista`, `cache`, `period`, `sort`), mesmos `load()`, `render()` (spinner, erro, vazio, ordenar) e `setXAsset`/`showX` | Fábrica `createHistoryTable({ fetch, columns, rowHtml, defaultPreset, cacheMs })` |
| D4 | `openOrdersTable`, `orderHistoryTable`, `tradeHistoryTable` | `headerHtml` com `th(label, key, title)` e o comparador de ordenação com `dir ±1`, 3 vezes | Util de tabela ordenável |
| D5 | `PriceChartPanel`: `loadFutures` × `loadLiquidations`, `futuresForChart` × `liquidationsForChart`, `updateFuturesAvailability` × `updateLiquidationsAvailability` × `updateProjectedAvailability` × `updateAvgAvailability` × `updateOrdersAvailability` × `buySimulator.updateSimAvailability` | Mesmo padrão de carga com chave e cache e de checkbox carregando/indisponível | Helper `createLayerLoader({ key, fetch, cacheMs })` e `setChipState(label, { loading, disabled, text, title })` |
| D6 | `PriceChartPanel`: `liqCache`, `futCache`, `liqRealCache`; `chartData`: `chartCache`, `openOrdersCache`; tabelas: `hist.cache`, `st.cache` | 7 caches `Map` com `{ at, data }` e checagem de TTL | `createTtlCache(ms)` no front |
| D18 | `server/binance/client.js` (`throttle`, `trackedFetch`) × `server/lib/rateLimit.js` | O cliente spot tem um controle de peso e de 429/418 próprio, anterior ao `lib/rateLimit.js`, que faz o mesmo para fapi e Coinalyze | Migrar o spot para `createRateLimiter({ weightHeader: "x-mbx-used-weight-1m", maxWeight: 5000 })`. Atenção: o spot espera quanto for preciso, sem `maxWaitMs`, e o `throttle` precisa rodar antes de montar o timestamp assinado |
| D9 | Listas de stablecoins: `USD_STABLES` (server), `isStable` em `openOrdersTable.js` e a lista literal em `overlays.openOrderTitle` (estas incluem BRL) | 3 listas que divergem | Constante única no front (e documentar a diferença em relação ao server) |
| D11 | `apiKeySettings.js` × `coinalyzeKeySettings.js` (`hintOf`, `invalid`); as duas rotas `POST /settings/*` em `routes.js` (try/finish/persist) | Mesmo código | Helper `keyStatus(key)` e um handler genérico de "salvar e persistir" |
| D13 | Constantes de tempo: `DAY_MS` (config), `DAY` (`liquidations`, `timeframe`, `periodFilter`, `measureTool`), `HOUR` (`liquidationMap`, `timeframe`, `measureTool`), `PERIOD_MS` (`futuresData`), `INTERVAL_MS` (`timeframe`) | Várias definições | Um módulo de constantes por lado |
| D14 | BRL a partir de USDT: `StatGrid.brlText`, `AssetStrip` (inline), `chartUtils.brlOf`; helpers `usdt()` em `OrdersPanel`, `orderSimulation`, `PriceChartPanel.renderDca`; `.toFixed(n).replace(".", ",")` espalhado | Formatação reimplementada | Usar e expandir `core/format.js` (`formatUSDT`, `formatBRL`, `formatPctPt`) |
| D15 | `ChartsPanel.js` × `chartUtils.js` | `ChartsPanel` repete o estilo de tooltip, ticks e grade inline e implementa à mão o toggle "mostrar todas" e o ajuste de altura, que já existem em `chartUtils` (`TOOLTIP_STYLE`, `AXIS_TICKS`, `createTopToggle`, `fitBarHeight`) e são usados por `pnlCharts.js` | Usar `chartUtils` |

## Padrões inconsistentes

| # | Onde | Inconsistência | Padrão a adotar |
|---|---|---|---|
| P1 | Front inteiro | Eventos por `onclick="fn()"` com funções em `window.*` (Simular Valorização do Topbar, cabeçalhos de tabela, Recarregar das abas, Simulação) **e** por `addEventListener` (componentes novos) | `addEventListener` no `init*()`, eliminando os `window.*` aos poucos |
| P3 | Ordenação | `core/sort.toggleSort` com `{ key, asc }` (Saldos, Ordens, Executadas) × `{ key, dir: ±1 }` implementado em cada tabela do gráfico | Um só util |
| P4 | Modais | Simulação: `style.display`, `alert()`, sem Esc e sem clique fora. Configurações: atributo `hidden`, Esc, clique fora, `role="dialog"` | Padrão das Configurações |
| P5 | Erros exibidos | `Erro: ${e.message}` em linha da tabela (Saldos, Ordens e Executadas) × "Tentar de novo" (`loadError.js`, só no gráfico) | `loadErrorHtml` generalizado |
| P7 | Formato da resposta | `/balances` usa snake_case no nível de cima (`total_usdt`, `usdt_brl_price`, `change_24h_*`) e camelCase dentro de `assets`. As demais rotas usam só camelCase | camelCase (exige ajustar `StatGrid`, `BalancesPanel` e `ChartsPanel`) |
| P9 | Chaves de `localStorage` | `priceChartX` (camelCase) × `balances-simple-view`, `price-chart-drawings`, `price-chart-draw-toolbar` (kebab-case) | `camelCase` (exige migração para não perder preferências) |
| P11 | Cores | As variáveis CSS (`--accent`, `--muted`…) existem em `base.css`, mas cerca de 17 cores hex estão fixas no JS (`ChartsPanel`, `chartUtils`, `overlays.COLORS`, `futuresPanes.COLORS`, `liquidationOverlay`, `createChart`) | Um módulo `theme.js` com as cores usadas no canvas |
| P12 | Teclado | Cerca de 10 listeners globais de `Escape` (modais, popovers, seletor, régua, desenhos, indicadores): um Esc fecha várias coisas de uma vez | Fechar só o elemento de cima (pilha simples) |
| P14 | Dependência de módulo "puro" | `timeframe.js` (funções puras) importa `KLINES_PAGE` de `chartData.js`, que importa `api/binance.js` | Constante em um módulo próprio |
| P16 | Formato da taxa | Ordens Executadas mostra "Taxa (USDT)" com `formatPrice` (casas variáveis); os outros totais em USDT usam 2 casas | Definir e aplicar |

## Código morto ou sem uso

| # | Onde | O quê |
|---|---|---|
| M2 | `api/binance.js` `fetchRaw` | Exportada e nunca importada. A rota `GET /raw` não é usada pela página |
| M3 | `GET /avg-buy-prices` | Rota "compat" sem consumidor |

## Arquitetura e manutenção

| # | Sev. | Item | Sugestão |
|---|---|---|---|
| A1 | Média | `PriceChartPanel.js` tem cerca de 1200 linhas e concentra o estado, os controles, 6 camadas, as cargas e as caixas de texto | Extrair cada camada para um módulo (`layers/stats.js`, `layers/dca.js`, `layers/liquidation.js`…) com `{ init, onAsset, chartOpts, renderBox }` |
| A2 | Média | `chart/createChart.js` (cerca de 560 linhas) e `chart/futuresPanes.js` (cerca de 600) | Separar os indicadores (`drawIndicators`) e o crosshair/tooltip em módulos |
| A4 | Baixa | `core/format.js` estende `String.prototype` e `Number.prototype` (`formatCurrency`) | Funções puras (`formatMoney(v)`) |
| A5 | Baixa | Sem ESLint e Prettier. O server usa tabs e o front usa espaços | Configurar um formatador (se a pessoa quiser) |

## Infraestrutura e segurança

| # | Sev. | Item | Sugestão |
|---|---|---|---|
| I6 | Baixa | `node-fetch` é dispensável no Node ≥ 18 (`fetch` global) | Remover a dependência (testar o tratamento de headers) |
| I7 | Baixa | `dailyRateCache` baixa de novo todo o histórico diário desde o primeiro trade quando vence (1 dia) | Buscar só os dias que faltam (incremental, como os trades) |
