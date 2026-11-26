---
titulo: Sinais de compra e venda — visão geral
resumo: Mecanismo (em desenvolvimento) que lê os indicadores e camadas já existentes nos tempos Diário e Semanal e informa, por paridade, a tendência atual e se o preço está em região provável de fundo ou de topo, listando os sinais presentes.
arquivos: [public/components/price-chart/signals/signals.js, public/components/price-chart/signals/signalsPanel.js, public/components/price-chart/signals/signals.css, public/components/price-chart/PriceChartPanel.html, public/components/price-chart/PriceChartPanel.js]
rotas: [GET /price-chart/:asset, GET /fear-greed]
eventos: []
storage: []
---

# Sinais de compra e venda

> **Estado: em desenvolvimento.** Etapas 1 a 3 prontas: o campo "Sinais" aparece no cabeçalho do gráfico de preço, com tendência por médias, MACD, RSI, esticagem da média e Fear & Greed. Faltam funding, liquidações e divergência de RSI (etapas 4 e 5). O andamento fica em [planejamento.md](planejamento.md), e este doc é atualizado a cada etapa concluída.

Documentação exclusiva dos sinais:

| Doc | Conteúdo |
|---|---|
| este | O que é, como aparece na tela, de onde vêm os dados, arquitetura e decisões tomadas |
| [catalogo-de-sinais.md](catalogo-de-sinais.md) | Cada sinal: regra, limiares padrão, fonte, o que indica e em que etapa entra |
| [planejamento.md](planejamento.md) | Etapas da v1 com marcação de concluído, pendências de decisão, preparos da v2 e ideias futuras |

## O que é

Um campo informativo **por paridade** no gráfico de preço. Ele não prevê nem recomenda: mostra quais sinais estão presentes agora e que padrão eles formam. Responde a três perguntas:

1. **Tendência atual:** alta, baixa ou lateral, no Diário e no Semanal.
2. **Região:** fundo provável, neutra ou topo provável, com um placar de confluência ("4 de 6 sinais de fundo").
3. **Quais sinais estão ativos:** cada um com o valor, há quantas velas está ativo e, quando há histórico, em que percentil o valor atual fica.

**Tempos gráficos:** Diário (D) e Semanal (S), **sempre**, qualquer que seja a vela na tela (como a [faixa estatística](../funcionalidades/grafico-de-preco/faixa-estatistica.md), que usa sempre velas diárias). 4h e Mensal ficam como refinamento futuro, numa visão alternativa, para não virar excesso.

## Como aparece na tela

- **Campo resumido "Sinais"** (`#price-chart-signals`) no cabeçalho do gráfico, na ponta direita da linha das informações de preço (`#price-chart-info`). Três pílulas:
  - **D** e **S**: tendência diária e semanal. ▲ verde = alta, ▼ vermelha = baixa, ▬ cinza = lateral, "–" = histórico insuficiente.
  - **Região:** "Fundo provável 3/4" (verde), "Topo provável 3/4" (vermelha) ou "Região neutra" (cinza). Os números são sinais ativos do lado ÷ sinais disponíveis. O `title` de cada pílula traz o detalhe.
- **Clicar no campo abre a janelinha flutuante** (`#price-chart-signals-pop`) logo abaixo dele, alinhada à direita, por cima do gráfico e da watchlist:
  - **Tendência:** uma linha por sinal de tendência.
  - **Fundo ou topo:** o placar ("fundo 1 · topo 0 · de 4 disponíveis") e uma linha por sinal.
  - Bolinha de cada linha: verde = fundo ou alta; vermelha = topo ou baixa; apagada = sinal não ativo; vazada = indisponível.
  - Rodapé: a hora do cálculo e o aviso de que não é previsão.
- Fecha com clique fora ou Esc.
- **Carregando:** "analisando..." com spinner. No Atualizar do topo, o resultado anterior continua na tela com um spinner ao lado até o novo chegar.
- **Erro de carga:** a pílula vira "indisponíveis" (motivo no `title`), e a janela mostra a mensagem e o botão "Tentar de novo".

## De onde vêm os dados

Tudo sai de rotas e funções **que já existem**. A v1 não cria rota nova no server.

| Fonte | Função / rota existente | Histórico | Uso nos sinais |
|---|---|---|---|
| Velas OHLC + volume | `chartData.getKlines(asset, "1d" \| "1w")` → `GET /price-chart/:asset` | Desde a listagem; 1000 velas por página | Base de tudo |
| Médias móveis | `chart/movingAverage.js` `movingAverage()` | O das velas | Tendência e esticagem |
| RSI (Wilder) | `chart/rsi.js` `rsi()` | O das velas | Sobrecompra/sobrevenda e divergência |
| MACD | `chart/macd.js` `macd()` | O das velas | Tendência e perda de força |
| Bollinger | `chart/bollinger.js` `bollinger()` | O das velas | Ideia futura (aperto, preço fora da banda) |
| CVD / Delta | `chart/cvd.js` `volumeDelta()` | O das velas | Ideia futura (divergência) |
| Volatilidade diária | `volatility.js` `dailyVolatility()` | 365 dias | Ideia futura (movimento em σ) |
| Fear & Greed | `GET /fear-greed` + `chart/fearGreed.js` | Diário desde fev/2018 | Medo/ganância extremos. É do **mercado** (BTC), igual para toda moeda |
| Funding | `GET /futures-data/:asset?period=1d` | Cerca de 333 dias | Funding extremo. Exige contrato perpétuo |
| Liquidações reais | `GET /liquidations/:asset` (Coinalyze) | Diário desde 2019 | Cascata de longs/shorts. Exige chave da Coinalyze; limite de ~40 chamadas/min |
| Open interest, long/short | `GET /futures-data/:asset` | **Só 30 dias** | Fora da v1: histórico curto demais para D/S |
| Mapa de liquidação estimado | `GET /liquidation-map/:asset` | 30 dias, é estimativa | Fora da v1 |
| Preço médio dinâmico da pessoa | `/positions` | — | Só contexto pessoal, não é sinal de mercado |

Pontos estruturais:

- Os indicadores são **funções puras no front**, hoje calculadas sobre a vela que está na tela. Os sinais chamam as mesmas funções com velas D e S próprias.
- O projeto é ESM (`"type": "module"` no `package.json`), então o server consegue importar essas funções puras. Isso é o que permite a v2 (varredura) reutilizar o núcleo sem reescrever.

## Arquitetura

- **Núcleo puro (implementado):** `public/components/price-chart/signals/signals.js`, sem DOM, sem `fetch` e sem ler o relógio. Recebe as velas D e S e o instante `now` e devolve o resultado. Testado em `test/public/signals.test.js`. Reaproveita `movingAverage`, `rsi`, `macd` e `macdHistogramTones`. Recebe também as linhas do Fear & Greed; funding e liquidações entram na etapa 4.
  - `analyzeSignals({ asset, daily, weekly, fearGreed, now }, cfg?)`: a análise completa.
  - `trendSignal`, `macdSignal`, `rsiSignal`, `stretchSignal` `(points, "d" | "w", now, cfg?)`: um sinal cada.
  - `fearGreedSignal(rows, now, cfg?)`: o sinal do Fear & Greed.
  - `regionOf(signals, cfg?)`: o placar de confluência.
  - `lastClosedIndex`, `streak`, `percentileRank`: auxiliares.
  - `SIGNAL_DEFAULTS`: os limiares fixos da v1. As funções aceitam outra configuração no último parâmetro (os testes usam médias curtas).
- **Painel (implementado):** `public/components/price-chart/signals/signalsPanel.js`, com o estado próprio (`view`: moeda, resultado, erro, carregando) e o desenho. Estilos em `signals/signals.css` (importado em `public/index.css`); o HTML do campo fica em `PriceChartPanel.html`.
  - `initSignalsPanel()`: liga o clique do campo, o clique fora, o Esc e o "Tentar de novo". Chamada em `initPriceChartPanel()`.
  - `loadSignals(asset)`: carrega as velas e chama `analyzeSignals`. Chamada em `openPriceChart()` (troca de moeda) e em `refreshPriceChart()` (Atualizar do topo, depois de `invalidateAssetCache`). Um `requestId` descarta a resposta de uma moeda que já foi trocada.
  - Fica fora do `PriceChartPanel.js`, que já é grande (ver [debitos-tecnicos](../debitos-tecnicos.md)): lá só existem o import e as três chamadas.
- **Carga dos dados:** independente das camadas ligadas e da vela na tela.
  - Velas `1d`: até 3 páginas de 1000 (`DAILY_PAGES`, cerca de 8 anos), das mais recentes para trás, para o percentil da esticagem. Para na primeira página incompleta (início do histórico).
  - Velas `1w`: 1 página, que cobre todo o histórico da Binance.
  - Tudo por `chartData.getKlines`, com o cache que já existe: a página recente vale 60 s e as antigas, 10 min. Com o gráfico em D ou S, a página recente é a mesma do gráfico (sem chamada extra).
  - Fear & Greed: `fetchFearGreed()` (`GET /fear-greed`), com cache próprio de 10 min no painel (`loadFearGreedRows`). É do mercado, então uma carga serve a todas as moedas. O Atualizar do topo busca de novo (`loadSignals(asset, { fresh: true })`). Se a fonte falhar, os outros sinais saem normalmente e o do Fear & Greed fica indisponível; numa recarga que falha, ficam as linhas que já estavam.
  - Funding e liquidações entram na etapa 4.

Formato do resultado de `analyzeSignals`:

```js
{
  asset: "BTC",
  generatedAt: 1764000000000,
  trend: { d: "up" | "down" | "side", w: "up" | "down" | "side" },
  region: { side: "bottom" | "top" | "neutral", bottom: 4, top: 0, of: 6 },   // placar de confluência
  signals: [{
    id: "rsi-d",            // identificador estável
    group: "trend" | "extreme" | "context",
    timeframe: "d" | "w" | null,
    available: true,        // false + reason quando a fonte falta (sem chave, sem perpétuo, pouco histórico)
    active: true,
    side: "bottom" | "top" | "up" | "down" | null,
    value: 27.4,            // valor atual do indicador
    bars: 3,                // há quantas velas FECHADAS seguidas está ativo
    forming: false,         // true: ativo só na vela em formação (bars = 0)
    percentile: 4,          // posição do valor atual no histórico da própria moeda (só na esticagem)
    details: { ... },       // números de apoio do sinal (médias, inclinação, extremos da esticagem)
    text: "RSI diário em 27,4: sobrevendido há 3 dias",
  }],
}
```

## Regras gerais

- **Vela em formação:** o valor e o estado "ativo" de cada sinal usam a última vela, mesmo em andamento, para o campo refletir o preço de agora. Já o "há N velas" (`bars`) conta só velas **fechadas** seguidas. Um sinal ativo com `bars = 0` vem com `forming: true` e o texto "na vela em formação": ainda não foi confirmado por um fechamento. A última vela conta como fechada quando `time + duração ≤ now`.
- **Calculável no passado:** as funções recebem as velas e o `now`. Para analisar uma data antiga (backtest), basta passar as velas até ela.

- **Limiares fixos na v1**, com padrões razoáveis (ver o [catálogo](catalogo-de-sinais.md)). Tornar configurável é ideia futura.
- **Percentil em vez de valor absoluto** sempre que houver histórico: "o preço está mais esticado que em 96% do histórico desta moeda" vale para BTC e para altcoin; "50M liquidados" não.
- **Fonte ausente não conta contra.** Sem chave da Coinalyze, sem contrato perpétuo ou com histórico insuficiente, o sinal aparece como "indisponível" (com o motivo) e sai do denominador do placar.
- **Confluência, não alerta único.** Um sinal isolado erra muito; a leitura é o conjunto.
- **Não é previsão.** A janela traz esse aviso, como a faixa estatística e o mapa de liquidação.
- **Só leitura e limites de API:** nenhuma chamada nova fora de `publicGet`/`fapiGet`/`coinalyzeGet`/`alternativeGet`; tudo passa pelas rotas existentes e seus caches.

## Casos de borda e armadilhas

- **Moeda recém-listada:** com menos de 200 velas diárias (ou 50 semanais) a tendência fica "–"; com menos de 365 + 200 diárias (ou 52 + 50 semanais) a esticagem fica indisponível. Esses sinais saem do placar.
- **USDT** abre no par USDT/BRL: os sinais são do dólar em reais. O Fear & Greed (do mercado cripto) entra no placar mesmo assim.
- **Fear & Greed com cache separado do painel do gráfico:** o painel "Fear & Greed Index" guarda o dele em `PriceChartPanel.js` (`view.fng`). São duas chamadas a `/fear-greed`, mas o server responde do cache de 10 min dele.
- **Fear & Greed parado:** se o último valor tiver mais de 2 dias, o sinal fica indisponível (`reason: "stale"`) em vez de usar um valor velho.
- **Página aberta por muito tempo:** os sinais só são recalculados ao trocar de moeda ou no Atualizar do topo. A hora do cálculo aparece no rodapé da janela.
- **Clique no título da moeda** (seletor) não fecha a janela dos sinais: o botão do seletor interrompe a propagação do clique (`assetPicker.js`). O mesmo já acontece com os menus de Personalizado e Camadas.
- A janela usa a classe `.pc-pop` (de `PriceChartPanel.css`) e sobrescreve a posição e a largura em `signals.css`.

## Como verificar

1. Abra `/site/grafico-de-preco` em BTC: à direita do cabeçalho aparece "Sinais" com "analisando..." e, em seguida, as pílulas D, S e a região.
2. Clique no campo: a janela abre abaixo dele, por cima do gráfico, com Tendência e Fundo ou topo. Compare o RSI 14 diário com o painel do RSI em vela D, a distância da SMA 200 com uma SMA 200 adicionada nos Indicadores, o MACD com o painel do MACD (em D e em S) e o Fear & Greed com o painel dele.
3. Feche com Esc e com um clique fora.
4. Troque a vela do gráfico para 1h: os sinais não mudam (são sempre D e S).
5. Troque de moeda: o campo volta a "analisando..." e mostra os sinais da nova moeda.
6. Abra uma moeda listada há pouco tempo: a esticagem aparece como "histórico insuficiente", com a bolinha vazada.
7. Clique em Atualizar no topo: as pílulas continuam na tela, com um spinner, e a hora do rodapé muda.

## Decisões tomadas

| Data | Decisão |
|---|---|
| 25/11/2026 | Foco em Diário e Semanal. 4h e Mensal só como refinamento, em visão alternativa, se valer a pena |
| 25/11/2026 | Interface: campo resumido no cabeçalho, que expande numa janelinha flutuante ao clicar |
| 25/11/2026 | Limiares fixos com bons padrões na v1 |
| 25/11/2026 | Conjunto da v1: RSI D/S, Fear & Greed, esticagem da média com percentil, liquidações, tendência por médias, MACD semanal, divergência de RSI e funding |
| 25/11/2026 | Registrar para a v2: tela de varredura, reaproveitamento da análise feita no gráfico e backtest dos sinais |

Pendências de decisão estão em [planejamento.md](planejamento.md#pendências-de-decisão).
