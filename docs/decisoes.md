# Decisões intencionais

São comportamentos que **parecem** errados ou incompletos, mas são escolhas do projeto. **Não "corrija"** nenhum deles sem pedido explícito. Ao tomar uma decisão nova de produto ou arquitetura, registre-a aqui com o motivo.

## Produto

| Decisão | Motivo | Onde |
|---|---|---|
| **Cards fixos USDT, BTC, XRP e ETH** no topo e cores fixas dessas moedas nos gráficos de distribuição (o resto vai para "Outros") | São as moedas que a pessoa acompanha. Cards dinâmicos (top N) foram considerados e descartados | `StatGrid.js` (`FIXED_CARD_ASSETS`), `StatGrid.html`, `ChartsPanel.js` (`HIGHLIGHT`) |
| **Somente leitura** na Binance | Segurança: a chave recomendada só tem "Habilitar leitura", e o app avisa se ela pode sacar ou negociar | `apiKeySettings.js` |
| **Preço médio "dinâmico"** (custo médio ponderado: as vendas reduzem a quantidade sem mudar o médio; zerou, recomeça) como médio principal | É o mesmo usado no P&L. O "preço médio fixo" (todas as compras) existe só na comparação DCA | `positions.js`, `dca.js` |
| Quantidade sem trade conhecido (depósito, Convert, Earn) **herda o mesmo preço médio** | Melhor do que ignorá-la. A `coverage` < 95% mostra ⚠ | `positions.js`, `BalancesPanel.js` |
| P&L, Ordens Executadas, marcadores e DCA cobrem **só as moedas em carteira hoje** | Limita o número de pares consultados em `myTrades` (peso da API) | `tradeHistory.js` |
| Conversão de trades em BRL/BTC/ETH/BNB pelo **fechamento diário** da data | Precisão suficiente com custo baixo (1 vela por dia) | `tradeHistory.js` (`rateToUSDTAt`) |
| **Mapa de liquidação é estimativa** e diz isso na interface. Os parâmetros (alavancagens, pesos 0,4/0,3/0,3, faixas de 0,25%) são suposições do modelo. Com a chave da Coinalyze, o modelo é **calibrado** pelas liquidações reais da Binance (só ela: o open interest do modelo é da Binance), mas continua estimativa. A divisão por alavancagem só troca a padrão quando acerta mais num trecho que ficou fora do ajuste, para não se ajustar ao ruído | Não existe dado público de posições | `liquidationMap.js`, `liquidationModel.js` |
| Faixa estatística e chance de tocar com **aviso de "não é previsão"** | Modelo lognormal sem tendência | `PriceChartPanel.js` (`renderStats`) |
| Aba padrão = **Gráfico de preço**. Timeframe padrão = **D + 1 ano**. Moeda padrão = última vista → BTC → a maior | Uso mais comum | `Tabs.html`, `PriceChartPanel.js` |
| Velas **intradiárias em hora local**, diárias e maiores no **dia UTC** | Mesmo comportamento da Binance | `chart/axis.js` |
| O eixo de preço automático inclui os preços médios, mas **não** as ordens abertas | Ordens muito distantes achatariam o gráfico. O resumo "↑ N acima" cobre isso | `createChart.js` (`autoscaleInfoProvider`), `overlays.js` |
| Indicadores, volatilidade e DCA são calculados **no front** | Usam as velas que já estão carregadas e evitam rotas novas | `movingAverage.js`, `bollinger.js`, `volatility.js`, `dca.js` |
| Filtro de período dos históricos é **local** (a lista vem inteira) | Uma requisição por moeda, e trocar o período é instantâneo | `periodFilter.js` |
| Liquidações reais dependem de uma chave **opcional** da Coinalyze | Sem chave, o resto do app funciona igual | `liquidations.js` |

## Técnica

| Decisão | Motivo | Onde |
|---|---|---|
| **Sem build, sem framework, sem TypeScript**; bibliotecas por CDN com versão fixa | Projeto pessoal e local, de manutenção simples | `public/index.html` |
| **Chaves editáveis pelo dashboard**, gravadas no `.env` **depois** de responder | O nodemon reinicia o server ao ver o `.env` mudar | `routes.js`, `config.js` |
| O secret **nunca volta** para a página (só `keyHint`) | Segurança | `apiKeySettings.js` |
| Cache curto no server (15 s ou mais) mesmo quando a pessoa clica em "Recarregar" ou "Atualizar" | Proteger o limite de peso da Binance em recargas seguidas | `lib/cache.js` |
| Cache **incremental** de `myTrades` em memória (sem disco) | A primeira carga é cara, as seguintes são baratas. Reiniciar o server refaz tudo | `binance/account.js` |
| Serviços de futuros e liquidações respondem **200 + `available: false`** em vez de erro | O front mostra uma mensagem específica por `reason` sem tratar exceção | `futuresData.js`, `liquidationMap.js`, `liquidations.js` |
| Rotas `/site/<slug>` servem o mesmo `index.html` | Cada aba tem URL própria (F5 e link direto) sem roteador no front | `server.js`, `Tabs.js` |
