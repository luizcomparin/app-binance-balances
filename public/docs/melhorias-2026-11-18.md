Analisei o projeto inteiro: o backend em [server.js](server.js) e os componentes em `public/`. Separei as sugestões em três grupos: o que já está quase pronto, bugs que distorcem os números, e funcionalidades novas.

## 1. Já está quase pronto, só falta ligar

- **Preço médio de compra e P&L.** A rota `/avg-buy-prices` ([server.js:91](server.js#L91)) existe, mas o front nunca a chama. Com ela dá para mostrar, por moeda, o preço médio, o preço atual, o lucro/prejuízo não realizado (em USDT, BRL e %) e o custo total investido contra o valor atual. Essa é a informação que mais falta no app.
- **Quantidade e preço de cada moeda.** A tabela de saldos só mostra valores em USDT. `fetchRaw()` é chamado em [BalancesPanel.js:19](public/components/balances/BalancesPanel.js#L19), mas o resultado é descartado, e `mapQuantities()` existe e não é usado em lugar nenhum. Daria para acrescentar as colunas "Qtd", "Preço atual" e "Preço médio".
- **Variação de 24h.** Trocar `/ticker/price` por `/api/v3/ticker/24hr` traz `priceChangePercent` sem nenhuma chamada extra. Com isso dá para mostrar a variação de cada moeda e a da carteira inteira nas últimas 24h.

## 2. Bugs que afetam os números

- **Agrupamento de ordens errado.** Em [server.js:244](server.js#L244), a regex `/USDT|BTC|ETH|.../` substitui a primeira ocorrência em qualquer posição do símbolo. Por isso `BTCUSDT` vira `"USDT"` e `ETHBTC` vira `"BTC"`. O certo é usar `/(USDT|BTC|...)$/`, ou melhor ainda, pegar `baseAsset` e `quoteAsset` de `/api/v3/exchangeInfo`.
- **Ordens em pares não-USDT aparecem como USDT.** Uma ordem em `ETHBTC` tem o total em BTC, mas a tela exibe "USDT". É preciso converter pelo preço do ativo de cotação.
- **Moedas somem do total sem aviso.** Em [server.js:189](server.js#L189), qualquer ativo sem par `XXXUSDT` é descartado. Isso afeta o **BRL** (`USDTBRL` existe, mas `BRLUSDT` não), os ativos de Earn (`LDBTC`, `LDUSDT`...) e moedas que só negociam contra BTC, FDUSD ou BRL. Na sua carteira, um saldo em reais provavelmente não está entrando no total. Dá para tentar pares alternativos e converter, ou usar o inverso (`1 / USDTBRL`).
- **O preço médio não é confiável.** Ele ignora as vendas (deveria ser custo médio ponderado com baixa nas vendas), ignora as taxas (`commission`), só lê os últimos 1000 trades, só olha o par `XXXUSDT` e faz as requisições em sequência. Além disso, moedas recebidas por depósito ou conversão (Convert, P2P) não aparecem em `myTrades`.
- **Os cards são fixos em BTC/XRP/ETH.** [StatGrid.html](public/components/stats/StatGrid.html) e os gráficos têm essas moedas no código. O ideal é gerar dinamicamente com o top N por valor e juntar o resto em "Outros".

## 3. Funcionalidades novas úteis

**Investimento e resultado**

- **Histórico de aportes.** As rotas `/sapi/v1/capital/deposit/hisrec`, `/sapi/v1/fiat/orders` e `/sapi/v1/fiat/payments` mostram quanto você realmente depositou em BRL. Com isso dá para calcular o **resultado real**: valor atual menos o total aportado, mais o total sacado.
- **Lucro realizado** nas vendas, separado do não realizado.
- **Apoio ao IR.** Vendas acima de R$ 35 mil no mês, e um custo médio em BRL por ativo para a ficha de Bens e Direitos.

**Visão completa da carteira**

- **Simple Earn / Staking.** `/sapi/v1/simple-earn/flexible/position` e `/locked/position` mostram saldos que não aparecem em `/api/v3/account`, junto com o APY e os rendimentos recebidos.
- **Funding wallet** (`/sapi/v1/asset/get-funding-asset`), muito usada pelo P2P.
- Opcionalmente, **Futures/Margin**, se você usar.

**Histórico e gráficos**

- **Evolução do patrimônio.** O endpoint `/sapi/v1/accountSnapshot?type=SPOT` devolve snapshots diários de até 30 dias. Daria também para gravar um snapshot local por dia (num JSON ou SQLite) e montar um gráfico de linha em USDT/BRL ao longo do tempo.
- **Gráfico de preço** por moeda com o preço médio de compra marcado (`/api/v3/klines`).

**Ordens**

- **Distância até a execução.** Mostrar quanto falta, em %, entre o preço atual e o preço da ordem.
- **Histórico de ordens executadas** (`allOrders`), não só as abertas.
- **Simulação usando as ordens abertas.** Responder "se todas as minhas vendas executarem, quanto fico em USDT?".

**Ferramentas**

- **Rebalanceamento.** Você define uma alocação-alvo (ex.: 50% BTC, 20% ETH...) e o app mostra quanto comprar ou vender de cada moeda.
- **Alertas de preço** ou de variação de alocação.
- **Atualização automática** a cada X segundos, ou em tempo real via WebSocket (`wss://stream.binance.com`).
- **Exportar para CSV.**

## 4. Infraestrutura

- **Cache curto** (15–30 s) nas rotas, porque cada recarga faz várias chamadas assinadas. A conta também é buscada duas vezes (`/balances` e `/raw`).
- **Usar `recvWindow` e sincronizar com o tempo do servidor** (`/api/v3/time`), para evitar o erro `-1021 Timestamp`.
- **Segurança.** O `cors()` está aberto para qualquer origem e `/raw` expõe os dados crus da conta. Vale restringir o CORS para localhost e confirmar que a API key está como **somente leitura**, com restrição de IP.
- **Limpeza.** O [binance-balances.js](binance-balances.js) está inteiro comentado e o livereload roda mesmo com `npm start`.

## Por onde eu começaria

1. Corrigir a regex das ordens e a conversão de BRL e de pares não-USDT, para os números ficarem certos.
2. Ligar o P&L por moeda usando o preço médio, já com o cálculo corrigido.
3. Adicionar a variação de 24h e os cards dinâmicos.
4. Incluir Simple Earn e o histórico de patrimônio.

Se quiser, posso começar por algum desses itens.
