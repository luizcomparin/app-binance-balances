---
titulo: Liquidações reais (Coinalyze)
resumo: Painel e bolhas sobre o gráfico com as liquidações que de fato aconteceram nos perpétuos USDT da moeda (Binance + Bybit + OKX, ou só Binance nas bolhas), por vela; exige chave gratuita da Coinalyze. Também calibra o mapa de liquidação estimado.
arquivos: [server/services/liquidations.js, server/coinalyze/client.js, server/config.js, public/components/price-chart/chart/futuresPanes.js, public/components/price-chart/chart/liquidationBubbles.js, public/components/price-chart/chart/createChart.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/PriceChartPanel.html, public/components/price-chart/PriceChartPanel.css]
rotas: [GET /liquidations/:asset]
eventos: [COINALYZE_KEY_CHANGED]
storage: [priceChartRealLiquidations, priceChartLiqBubbles, priceChartLiqBubblesSource, priceChartLiqBubblesMin]
---

# Liquidações reais

## O que faz

O checkbox `#price-chart-liqreal` ("Liquidações") adiciona um painel abaixo do gráfico, depois do volume, do CVD, do RSI e do MACD e antes dos de futuros (a ordem dos checkboxes):

- barras **vermelhas para cima**: longs liquidados (vendas forçadas);
- barras **verdes para baixo**: shorts liquidados (compras forçadas);
- no título: Longs, Shorts e a divisão por corretora na vela sob a mira.

### Bolhas sobre o gráfico

O checkbox `#price-chart-liqbubbles` ("Bolhas de liquidações (reais)", no grupo das camadas sobre o gráfico, logo depois do mapa de liquidação) desenha uma bolha por vela e por lado, com área proporcional ao valor liquidado:

- **vermelha na mínima** da vela: longs liquidados;
- **verde na máxima**: shorts liquidados;
- as 3 maiores bolhas visíveis ganham o valor (`formatUsdShort`).

A Coinalyze não diz o preço de cada liquidação, só quanto foi liquidado no período: a altura da bolha é aproximada (o extremo da vela). As opções ficam na engrenagem do próprio checkbox (`#price-chart-liqbubbles-gear`), que abre uma caixa logo abaixo dele, dentro das Camadas (`#price-chart-liqbubbles-settings`, mesmo `bindLayerGear` da engrenagem do mapa de liquidação). **Corretoras** (`#price-chart-liqbubbles-source`): **Binance + Bybit + OKX** (padrão, soma de `long`/`short`) ou **só Binance** (`by.Binance`, a mesma corretora do mapa estimado).

**Acima de (US$)** (`#price-chart-liqbubbles-min`): só aparecem as bolhas a partir desse valor liquidado na vela, por lado. Aceita `5M`, `500K`, `1,5M`, `2B` ou um número (`parseUsdAmount`). Vazio ou 0 mostra todas, e texto inválido volta ao valor anterior. O limite é **global**, o mesmo para todas as moedas (`view.liqBubblesMin`). Uma versão anterior salvava um limite por moeda (`{ MOEDA: US$ }`). Nesse caso, `readBubblesMin` passa a usar o limite da última moeda vista. Esconder as menores não muda o tamanho das que ficam, porque a escala é calculada com todas as bolhas (`bubblesAbove`).

As liquidações reais também calibram o [mapa de liquidação estimado](mapa-de-liquidacao.md) (só com a parte da Binance).

**Sem chave da Coinalyze**, ligar o painel ou as bolhas abre as Configurações direto na seção da Coinalyze (`openSettings("coinalyze")`). O texto dos dois checkboxes avisa "configure a chave", "chave recusada", "sem contrato perpétuo" ou "indisponíveis".

## Server (`services/liquidations.js`)

1. Sem chave: `{ available: false, reason: "no-key" }`, sem chamar a API.
2. `marketsFor(asset)`: busca `/exchanges` e `/future-markets` (cache de 24 h) e encontra o perpétuo USDT em Binance, Bybit e OKX (prefixos `LOT_PREFIXES` de `binance/futures.js`: `""`, `1000`, `1000000`, `1M`). Sem nenhum: `reason: "no-market"`.
3. `GET /liquidation-history` com `convert_to_usd=true`. O intervalo depende da vela:

   | Vela | Intervalo na Coinalyze | Período pedido |
   |---|---|---|
   | 1h | `1hour` | 120 dias |
   | 4h | `4hour` | 2 anos |
   | D/S/M | `daily` | desde 2019 (o gráfico soma os dias de cada vela) |

4. Soma as corretoras por instante: `rows: [{ t, long, short, by: { Binance: {...} } }]`.
5. Erros viram `{ available: false, reason: "invalid-key" | "error", message }`, **sempre com status 200**.

Cache de 5 min por `asset:interval`.

## Página

- O painel e as bolhas usam os mesmos dados: `liqRealData()` carrega quando um dos dois está ligado (`liqRealWanted()`), `liquidationsForChart()` entrega ao painel e `liquidationBubblesForChart()` monta as bolhas com `liquidationBubbles(points, rows, source)` (`chart/liquidationBubbles.js`, testado em `test/public/liquidationBubbles.test.js`). `updateLiquidationsAvailability()` atualiza os dois checkboxes (`updateLiqRealChip`).
- `chart/liquidationBubbles.js` → `LiquidationBubbles`, primitive anexado à série principal (como o mapa). Escala pelo percentil 98; bolhas menores que 3% da escala não são desenhadas. `setData(list, minUsd)` recebe o limite, e o `render()` passa `liquidationBubbles: { list, minUsd }`.
- `loadLiquidations()` funciona como os painéis de futuros, com chave `asset|vela` e `liqRealCache` de 5 min. Só ficam em cache as respostas com sucesso ou `no-market`; sem chave ou com erro, tenta de novo na próxima vez.
- `COINALYZE_KEY_CHANGED` → `reloadLiquidations()` limpa o cache e recarrega (também o mapa de liquidação).
- `futuresPanes`:
  - `alignLiquidations()` soma as linhas por vela (`sum`);
  - dentro do período coberto, vela sem linha vale 0 (a Coinalyze omite períodos zerados);
  - a série dos shorts é desenhada com valor negativo.

## Casos de borda

- O histórico intradiário da Coinalyze é curto, então em 1h/4h as barras antigas ficam vazias.
- O limite gratuito é de cerca de 40 chamadas/min. Erros de limite aparecem como "indisponíveis", com a mensagem no `title`.

## Como verificar

1. Sem chave, ligue a camada: as Configurações abrem.
2. Salve a chave: o painel aparece.
3. Troque a vela entre 4h e D.
4. Ligue as bolhas: bolhas vermelhas nas mínimas e verdes nas máximas das velas com liquidação. Abra a engrenagem do checkbox (a camada continua ligada) e troque Corretoras para "Só Binance": as bolhas encolhem e a escolha continua depois de recarregar a página.
5. Digite `20M` em "Acima de (US$)": ficam só as bolhas grandes, com o mesmo tamanho de antes. Apague o campo: voltam todas.
6. Ponha `20M` em BTC e troque para ETH: o campo continua `20,0M` (o limite vale para todas as moedas).
