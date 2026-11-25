# AGENTS.md — mapa inicial do projeto

Ponto de partida para qualquer agente (ou pessoa) que vá trabalhar neste repositório. Leia este arquivo inteiro antes de mexer no código. Ele explica as regras e aponta onde está cada coisa. Os detalhes ficam em [`docs/`](docs/README.md).

## O que é

Dashboard **local** e **somente leitura** da conta Binance de uma pessoa. Ele mostra:

- a carteira spot em USDT e BRL;
- o P&L por moeda (custo médio);
- as ordens abertas e executadas;
- um gráfico de preço completo, no estilo TradingView, com camadas de análise (futuros, liquidações, indicadores, desenhos).

São duas partes:

- **Server** (`server.js` + `server/`): Node + Express 5. Fala com a Binance (chave assinada), com a Binance Futures (dados públicos) e com a Coinalyze (opcional), e expõe uma API JSON local.
- **Página web** (`public/`): HTML/CSS/JS puro em ES modules, **sem build**. O próprio Express serve a página em `/site`. Chart.js e Lightweight Charts vêm de CDN.

## Como rodar

```bash
npm install
npm run dev      # nodemon (reinicia o server ao salvar server/, server.js ou .env) + livereload da página
npm start        # node server.js (sem livereload)
npm test         # testes automatizados (node --test, em test/)
```

- Requer Node **≥ 20.12** por causa do `process.loadEnvFile()` (testado no 22).
- É obrigatório existir um `.env` com `PORT` na pasta onde o comando roda; copie de `.env.example`. As chaves da Binance e da Coinalyze podem ficar vazias e ser informadas depois em **Configurações** (engrenagem no topo).
- Abra `http://localhost:<PORT>/site`. O server só aceita conexões do próprio computador (`127.0.0.1`/`::1`). Cada aba tem sua URL: `/site/grafico-de-preco`, `/site/saldos` etc.
- **Atalho no Windows:** `iniciar.bat` (dois cliques) roda `npm start` e não abre o navegador: a URL do site (`http://localhost:<PORT>/site`) aparece no terminal quando o server termina de carregar. Fechar a janela do CMD desliga o server. Dá para criar um atalho dele na área de trabalho ou em `shell:startup` (abrir junto com o Windows).

## Mapa do repositório

```
server.js                  sobe o Express, livereload, arquivos estáticos e rotas /site/*
server/
  config.js                .env (PORT, chaves), troca de chaves em memória + gravação no .env
  routes.js                todas as rotas HTTP (validam a entrada e chamam um serviço)
  lib/cache.js             cached() (memoização com TTL e promise compartilhada) e mapLimit()
  lib/rateLimit.js         limitador de requisições (fapi e Coinalyze): teto por janela/peso, 429 + Retry-After
  binance/client.js        GET público/assinado, limite de peso, 429/418, sincronização de relógio
  binance/account.js       conta, ordens abertas, allOrders, cache incremental de myTrades
  binance/market.js        cotações, ticker 24h, exchangeInfo, conversão p/ USDT
  binance/futures.js       fapi pública: contrato perpétuo da moeda, séries /futures/data
  coinalyze/client.js      GET autenticado na Coinalyze
  services/*.js            uma regra de negócio por arquivo (wallet, positions, priceChart...)
public/
  index.html / index.js    página única; index.js faz o boot e expõe funções em window.*
  index.css                só @import dos CSS dos componentes
  api/binance.js           todas as chamadas do front à API local
  core/                    state, eventos, formatação, ordenação, pairCombo, carga de posições
  components/<nome>/       cada componente = <Nome>.html + .css + .js
  components/price-chart/  gráfico de preço (o maior módulo; ver docs/funcionalidades/grafico-de-preco)
test/                      testes das funções puras (server/ e public/), rodados por npm test
docs/                      documentação oficial (índice em docs/README.md)
```

## Onde está cada coisa: "quero mexer em…"

| Quero mexer em… | Leia | Arquivos principais |
|---|---|---|
| Visão geral / como as partes se encaixam | [arquitetura/visao-geral.md](docs/arquitetura/visao-geral.md) | `server.js`, `public/index.js` |
| Camadas do server | [arquitetura/server.md](docs/arquitetura/server.md) | `server/**` |
| Estrutura do front (componentes, boot, eventos) | [arquitetura/frontend.md](docs/arquitetura/frontend.md) | `public/index.js`, `public/components/app/` |
| Padrões de código a seguir | [arquitetura/convencoes.md](docs/arquitetura/convencoes.md) | — |
| Uma rota HTTP (parâmetros, resposta, quem usa) | [referencia/api.md](docs/referencia/api.md) | `server/routes.js`, `public/api/binance.js` |
| Eventos e `state` do front | [referencia/eventos-e-estado.md](docs/referencia/eventos-e-estado.md) | `public/core/events.js`, `public/core/state.js` |
| Chaves de `localStorage` | [referencia/armazenamento-local.md](docs/referencia/armazenamento-local.md) | — |
| Caches e TTLs (server e front) | [referencia/cache.md](docs/referencia/cache.md) | `server/lib/cache.js` |
| Binance / Futures / Coinalyze / CDNs | [referencia/integracoes-externas.md](docs/referencia/integracoes-externas.md) | `server/binance/*`, `server/coinalyze/*` |
| `.env`, chaves, CORS, segurança | [referencia/configuracao-e-seguranca.md](docs/referencia/configuracao-e-seguranca.md) | `server/config.js` |
| Termos (P&L, preço médio dinâmico, cobertura, OI…) | [referencia/glossario.md](docs/referencia/glossario.md) | — |
| Cards do topo, faixa de ativos, total da carteira | [funcionalidades/carteira-e-cards.md](docs/funcionalidades/carteira-e-cards.md) | `services/wallet.js`, `StatGrid`, `AssetStrip` |
| Aba Saldos, preço médio e P&L | [funcionalidades/saldos-e-pnl.md](docs/funcionalidades/saldos-e-pnl.md) | `services/positions.js`, `services/tradeHistory.js`, `BalancesPanel` |
| Aba Gráficos de Distribuição | [funcionalidades/graficos-de-distribuicao.md](docs/funcionalidades/graficos-de-distribuicao.md) | `components/charts/*` |
| Aba Ordens Abertas | [funcionalidades/ordens-abertas.md](docs/funcionalidades/ordens-abertas.md) | `services/openOrders.js`, `OrdersPanel` |
| Aba Ordens Executadas | [funcionalidades/ordens-executadas.md](docs/funcionalidades/ordens-executadas.md) | `services/executedOrders.js`, `ExecutedOrdersPanel` |
| Simular Valorização (modal) | [funcionalidades/simulacao-de-valorizacao.md](docs/funcionalidades/simulacao-de-valorizacao.md) | `SimulationModal` |
| Configurações (chaves Binance/Coinalyze) | [funcionalidades/configuracoes.md](docs/funcionalidades/configuracoes.md) | `services/*KeySettings.js`, `SettingsModal` |
| Navegação por abas e URL | [funcionalidades/abas-e-navegacao.md](docs/funcionalidades/abas-e-navegacao.md) | `components/tabs/Tabs.js`, `server.js` |
| **Gráfico de preço** (visão geral e mapa dos ~25 arquivos) | [funcionalidades/grafico-de-preco/README.md](docs/funcionalidades/grafico-de-preco/README.md) | `components/price-chart/**` |
| Velas, período, tamanho de vela, histórico antigo | [grafico-de-preco/velas-e-timeframe.md](docs/funcionalidades/grafico-de-preco/velas-e-timeframe.md) | `services/priceChart.js`, `timeframe.js`, `chartData.js` |
| Linhas de preço médio, ordens no gráfico, legenda, tooltip | [grafico-de-preco/sobreposicoes-e-legenda.md](docs/funcionalidades/grafico-de-preco/sobreposicoes-e-legenda.md) | `chart/overlays.js`, `chart/legend.js`, `chart/tooltip.js` |
| Médias móveis, Bollinger, média do volume | [grafico-de-preco/indicadores.md](docs/funcionalidades/grafico-de-preco/indicadores.md) | `indicatorControls.js`, `chart/movingAverage.js`, `chart/bollinger.js` |
| Desenhos e régua de medição | [grafico-de-preco/desenhos-e-regua.md](docs/funcionalidades/grafico-de-preco/desenhos-e-regua.md) | `chart/drawings.js`, `chart/measureTool.js` |
| Camadas: preços médios projetados e simulador de compra | [grafico-de-preco/simulador-e-projecoes.md](docs/funcionalidades/grafico-de-preco/simulador-e-projecoes.md) | `buySimulator.js` |
| Camada: faixa estatística (volatilidade) | [grafico-de-preco/faixa-estatistica.md](docs/funcionalidades/grafico-de-preco/faixa-estatistica.md) | `volatility.js` |
| Camada: comparação com compra mensal fixa (DCA) | [grafico-de-preco/comparacao-dca.md](docs/funcionalidades/grafico-de-preco/comparacao-dca.md) | `dca.js` |
| Camada: mapa de liquidação estimado | [grafico-de-preco/mapa-de-liquidacao.md](docs/funcionalidades/grafico-de-preco/mapa-de-liquidacao.md) | `services/liquidationMap.js`, `services/liquidationModel.js`, `chart/liquidationOverlay.js`, `paneSettings.js` |
| Camada: MACD (painel com engrenagem de configurações) | [grafico-de-preco/macd.md](docs/funcionalidades/grafico-de-preco/macd.md) | `chart/macd.js`, `paneSettings.js`, `chart/futuresPanes.js` |
| Camada: RSI (painel com engrenagem de configurações) | [grafico-de-preco/rsi.md](docs/funcionalidades/grafico-de-preco/rsi.md) | `chart/rsi.js`, `paneSettings.js`, `chart/futuresPanes.js` |
| Camada: painéis de volume/CVD/OI/long-short/funding | [grafico-de-preco/paineis-de-futuros.md](docs/funcionalidades/grafico-de-preco/paineis-de-futuros.md) | `services/futuresData.js`, `chart/futuresPanes.js`, `chart/cvd.js`, `paneSettings.js` |
| Camada: liquidações reais (Coinalyze) | [grafico-de-preco/liquidacoes-reais.md](docs/funcionalidades/grafico-de-preco/liquidacoes-reais.md) | `services/liquidations.js`, `chart/liquidationBubbles.js` |
| Watchlist e seletor de moeda | [grafico-de-preco/watchlist-e-seletor.md](docs/funcionalidades/grafico-de-preco/watchlist-e-seletor.md) | `watchlist.js`, `assetPicker.js` |
| Abas abaixo do gráfico (ordens abertas, históricos) | [grafico-de-preco/abas-de-ordens.md](docs/funcionalidades/grafico-de-preco/abas-de-ordens.md) | `*Table.js`, `periodFilter.js` |
| Decisões intencionais (não "corrigir") | [decisoes.md](docs/decisoes.md) | — |
| Débitos técnicos, código duplicado, bugs suspeitos | [debitos-tecnicos.md](docs/debitos-tecnicos.md) | — |
| Ideias ainda não implementadas | [backlog/ideias-futuras.md](docs/backlog/ideias-futuras.md) | — |

Para achar o doc de um arquivo específico, faça um grep pelo caminho: `grep -rl "server/services/positions.js" docs/`. O cabeçalho YAML de cada doc lista os arquivos que ele cobre.

## Regras de trabalho

1. **Escopo estrito.** Faça só o que foi pedido. Não refatore, não "melhore" e não corrija nada fora do pedido. Débitos encontrados vão para [debitos-tecnicos.md](docs/debitos-tecnicos.md), não para o código. Antes de mudar algo que parece errado, veja [decisoes.md](docs/decisoes.md). Os cards fixos USDT/BTC/XRP/ETH, por exemplo, são intencionais.
2. **Nunca leia, exiba, copie ou commite o `.env`.** Ele tem as chaves reais da conta. O `.gitignore` já o exclui. Use `.env.example` como referência.
3. **Só leitura na Binance.** O app nunca cria, cancela ou altera ordens, e assim deve continuar. Não adicione chamadas que não sejam GET a endpoints de leitura.
4. **Respeite os limites das APIs.** Toda chamada à Binance spot passa por `publicGet`/`signedGet` (em `server/binance/client.js`), que controlam o peso. A fapi passa por `fapiGet` e a Coinalyze por `coinalyzeGet`, que usam `server/lib/rateLimit.js`. Nunca chame essas APIs com `fetch` direto. Novas chamadas caras precisam de cache (`cached`). Veja [integracoes-externas.md](docs/referencia/integracoes-externas.md).
5. **Mudança que atravessa front e server:** atualize os dois lados *e* os dois docs de referência ([api.md](docs/referencia/api.md) e o doc da funcionalidade).
6. **PT-BR** em comentários, textos de interface, mensagens de erro e documentação. Os nomes de código seguem em inglês, como já são.
7. **Rode `npm test`** depois de mexer em regra de negócio (custo médio, timeframe, volatilidade, DCA, indicadores, simulador, formatação, cache, limitador). Funções puras novas ganham testes em `test/` (ver [convencoes.md](docs/arquitetura/convencoes.md#testes)). Não há build, e a interface não tem testes: verifique manualmente com `npm run dev`, abrindo a aba afetada e seguindo a seção "Como verificar" do doc da funcionalidade. Diga explicitamente o que foi e o que não foi verificado.
8. **Sem dependências novas** sem pedir. No front, bibliotecas só por CDN com versão fixa, como as atuais.
9. **Ao terminar uma tarefa, faça commit e push** na `main` (`git push origin main`), sem esperar pedido. Antes: verificação feita (`npm test` e o que mais couber) e docs atualizados no mesmo commit. Inclua só os arquivos da tarefa (nunca o `.env`). Mensagem em PT-BR no formato `feat: …` / `fix: …` / `docs: …` / `test: …` (ver `git log`), com um resumo do que mudou. Se a verificação falhou ou a tarefa ficou pela metade, **não** faça commit: explique o que falta.

## Receitas rápidas

Os detalhes ficam em [convencoes.md](docs/arquitetura/convencoes.md#checklists).

- **Nova rota:**
  1. Serviço em `server/services/`.
  2. Rota em `server/routes.js`, com o middleware `validAsset` (se tiver `:asset`) e `handle()`.
  3. Função em `public/api/binance.js`, usando `getJson`.
  4. Entrada em [api.md](docs/referencia/api.md) e no doc da funcionalidade.
- **Novo componente:**
  1. Pasta `public/components/<x>/` com `X.html`, `X.css` e `X.js`.
  2. Slot `data-component` em `AppShell.html`.
  3. `@import` em `public/index.css`.
  4. `initX()` em `public/index.js`.
  5. Doc em `docs/funcionalidades/`.
- **Nova camada no gráfico de preço:**
  1. Checkbox em `#price-chart-layers` (`PriceChartPanel.html`).
  2. Flag `view.showX` + chave de storage em `PriceChartPanel.js`.
  3. Dado novo em `render()` → `chart.update()`.
  4. Desenho em `chart/`.
  5. Doc em `docs/funcionalidades/grafico-de-preco/`.
- **Nova chave de `localStorage`:** use leitura e escrita com `try/catch` e registre em [armazenamento-local.md](docs/referencia/armazenamento-local.md).
- **Novo evento:** constante em `public/core/events.js` e registro em [eventos-e-estado.md](docs/referencia/eventos-e-estado.md).

## Manutenção da documentação

- Atualize os docs **no mesmo commit** da mudança de código. Ajuste também o cabeçalho YAML: `arquivos`, `rotas`, `eventos`, `storage`.
- Referencie **arquivos e nomes de função/id do DOM**, nunca números de linha.
- Funcionalidade nova ganha doc novo, seguindo o modelo de [docs/README.md](docs/README.md#modelo-de-doc-de-funcionalidade), e uma linha na tabela acima.
- Todo arquivo de `server/` e `public/` deve aparecer no `arquivos:` de algum doc. Para conferir: `node docs/verificar-cobertura.mjs`.
