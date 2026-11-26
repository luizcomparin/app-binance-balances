---
titulo: Liquidações reais (Coinalyze)
resumo: Painel abaixo do gráfico e camada sobre ele (perfil por preço, bolhas ou maiores eventos, posicionados pelas velas de 1h) com as liquidações que de fato aconteceram nos perpétuos USDT da moeda (Binance + Bybit + OKX, ou só Binance); exige chave gratuita da Coinalyze. Também calibra o mapa de liquidação estimado.
arquivos: [server/services/liquidations.js, server/coinalyze/client.js, server/config.js, public/components/price-chart/chart/futuresPanes.js, public/components/price-chart/chart/liquidationBubbles.js, public/components/price-chart/chart/createChart.js, public/components/price-chart/PriceChartPanel.js, public/components/price-chart/PriceChartPanel.html, public/components/price-chart/PriceChartPanel.css]
rotas: [GET /liquidations/:asset, GET /price-chart/:asset]
eventos: [COINALYZE_KEY_CHANGED]
storage: [priceChartRealLiquidations, priceChartLiqBubbles, priceChartLiqBubblesStyle, priceChartLiqBubblesSource, priceChartLiqBubblesMin, priceChartLiqBubblesTop]
---

# Liquidações reais

## O que faz

O checkbox `#price-chart-liqreal` ("Liquidações") adiciona um painel abaixo do gráfico, depois do volume, do CVD, do RSI e do MACD e antes do Fear & Greed e dos de futuros (a ordem dos checkboxes):

- barras **vermelhas para cima**: longs liquidados (vendas forçadas);
- barras **verdes para baixo**: shorts liquidados (compras forçadas);
- no título: Longs, Shorts e a divisão por corretora na vela sob a mira.

### Liquidações reais no gráfico

O checkbox `#price-chart-liqbubbles` ("Liquidações reais no gráfico", no grupo das camadas sobre o gráfico, logo depois do mapa de liquidação) desenha as liquidações sobre o preço. As cores são as do painel: **vermelho** para longs liquidados e **verde** para shorts. O **Estilo** é escolhido na engrenagem:

| Estilo | O que mostra |
|---|---|
| **Perfil por preço** (padrão) | Histograma horizontal na borda esquerda, só com as velas visíveis. O valor liquidado em cada período é espalhado por igual na faixa de preço que ele percorreu: longs entre a abertura e a mínima, shorts entre a abertura e a máxima. As 3 maiores faixas ganham o valor. Mostra em que preços mais houve cascata |
| **Bolhas** | Uma bolha por vela e por lado, com área proporcional ao valor. As 3 maiores bolhas visíveis ganham o valor |
| **Maiores eventos** | Só as N maiores liquidações visíveis (por vela e lado): um ponto, uma linha tracejada até a borda direita e o rótulo "Longs 185,5M · 69.107,00" |

**Posicionamento pelas velas de 1h.** A Coinalyze não diz o preço de cada liquidação, só quanto foi liquidado no período. Para chegar mais perto:
- cada **hora** fica na vela de 1h dela: longs na mínima e shorts na máxima, com a faixa até a abertura daquela hora;
- a bolha (ou evento) de uma vela maior fica na média desses preços, ponderada pelo valor, e o perfil usa cada hora separadamente;
- o dado horário cobre cerca de 83 dias (o que a Coinalyze guarda em 1h). As velas do gráfico anteriores a isso, ou cobertas só em parte, usam a vela do próprio gráfico (mínima e máxima dela);
- enquanto o dado de 1h carrega, ou se falhar, tudo usa a vela do gráfico e é redesenhado quando ele chega.

As opções ficam na engrenagem do próprio checkbox (`#price-chart-liqbubbles-gear`), que abre uma caixa logo abaixo dele, dentro das Camadas (`#price-chart-liqbubbles-settings`, o mesmo `bindLayerGear` da engrenagem do mapa de liquidação):

- **Estilo** (`#price-chart-liqbubbles-style`): perfil por preço, bolhas ou maiores eventos.
- **Corretoras** (`#price-chart-liqbubbles-source`): **3 corretoras**, Binance + Bybit + OKX (padrão, soma de `long`/`short`) ou **só Binance** (`by.Binance`, a mesma corretora do mapa estimado).
- **Acima de (US$ ou %)** (`#price-chart-liqbubbles-min`): bolhas e maiores eventos só a partir desse valor liquidado na vela, por lado. O perfil usa tudo, e o campo fica desabilitado com ele. Aceita `5M`, `500K`, `1,5M`, `2B` ou um número (`parseUsdAmount`). Vazio ou 0 mostra todas, e texto inválido volta ao valor anterior (`parseBubblesLimit`).
  - **Em porcentagem** (`20%`, `12,5%`): só as N% maiores **de todo o histórico carregado** da moeda no tamanho de vela atual (uma por vela e por lado, longs e shorts juntos). O corte é calculado uma vez por dado (`topShareCutoff`, em `setData`), não a cada desenho: arrastar ou dar zoom não muda quais aparecem, e um trecho calmo pode ficar sem nenhuma. Muda ao trocar de moeda, de vela ou de Corretoras, e quando chega mais histórico. Arredonda para cima (sempre sobra pelo menos uma) e empates no corte entram. `100%` e `0%` mostram todas; acima de 100 é inválido. Nos maiores eventos, vale junto com "Quantos eventos" (no máximo N, e só entre as N% maiores). Em Bolhas, as menores que 3% da escala continuam sem desenho, mesmo dentro das N%. Fica em `view.liqBubblesPct` e zera o limite em US$ (e vice-versa).
  - O limite é **global**, o mesmo para todas as moedas (`view.liqBubblesMin`). Uma versão anterior salvava um limite por moeda (`{ MOEDA: US$ }`); nesse caso, `readBubblesMin` usa o limite da última moeda vista. Esconder as bolhas menores não muda o tamanho das que ficam, porque a escala é calculada com todas (`bubblesAbove`).
- **Quantos eventos** (`#price-chart-liqbubbles-top`): 3, 5 (padrão) ou 10. Só vale para os maiores eventos.

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

- O painel e a camada sobre o gráfico usam os mesmos dados no tamanho de vela do gráfico: `liqRealData()` carrega quando um dos dois está ligado (`liqRealWanted()`), e `liquidationsForChart()` entrega ao painel. `updateLiquidationsAvailability()` atualiza os dois checkboxes (`updateLiqRealChip`).
- A camada também carrega o dado de 1h da moeda (`loadLiqHourly`, em `view.liqHourly`): `/liquidations?interval=1h` (mesmo `liqRealCache`, chave `ASSET|1h`, e mesma resposta que o server usa na calibração do mapa) e até 3 páginas de 1000 velas de 1h do spot (`getKlines(asset, "1h", before)`, das mais recentes para trás, até cobrir a primeira hora com liquidação). O Atualizar e a troca de chave descartam esse dado.
- `liquidationBubblesForChart()` monta `{ events, style, minUsd, pct, top }`: `liquidationEvents(points, rows, hourly, source)` gera os eventos (`{ index, t, side, usd, price, lo, hi }`).
- `chart/liquidationBubbles.js` → `LiquidationBubbles`, primitive anexado à série principal (como o mapa), com os três estilos. As contas são puras e testadas em `test/public/liquidationBubbles.test.js`: `liquidationEvents`, `barBubbles` (soma por vela e lado e preço ponderado), `priceProfile` (perfil em faixas de preço), `topBubbles`, `bubblesAbove`, `topShareCutoff`, `bubbleScale`, `bubbleRadius`, `parseUsdAmount` e `parseBubblesLimit`. As bolhas usam escala pelo percentil 98, e as menores que 3% dela não são desenhadas. O perfil é recalculado a cada desenho com as velas e a faixa de preço visíveis, em faixas de 4 px. Com o eixo em escala log, `priceProfile(..., { log: true })` divide a faixa em progressão geométrica, para as faixas continuarem com a mesma altura na tela.
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
4. Ligue "Liquidações reais no gráfico": aparece o perfil por preço na borda esquerda (vermelho = longs, verde = shorts). Arraste o gráfico: o perfil muda com as velas visíveis.
5. Na engrenagem (a camada continua ligada), troque o Estilo para Bolhas e depois para Maiores eventos. Em Bolhas, troque Corretoras para "Só Binance": as bolhas encolhem. As escolhas continuam depois de recarregar a página.
6. Em Bolhas ou Maiores eventos, digite `20M` em "Acima de (US$)": ficam só as grandes. Digite `20%`: ficam só as 20% maiores de todo o histórico carregado, e o conjunto não muda ao dar zoom ou arrastar; o `20%` continua no campo depois de recarregar a página. No Perfil o campo fica desabilitado.
7. Em vela 4h ou D, nos últimos ~80 dias, as bolhas ficam no meio da vela (onde a maior parte aconteceu, pelas velas de 1h), e não sempre na mínima ou máxima. Antes disso, voltam ao extremo da vela.
