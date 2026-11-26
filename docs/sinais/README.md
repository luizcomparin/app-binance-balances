---
titulo: Sinais de compra e venda — visão geral
resumo: Mecanismo (em desenvolvimento; o núcleo de cálculo existe, a interface ainda não) que lê os indicadores e camadas já existentes nos tempos Diário e Semanal e informa, por paridade, a tendência atual e se o preço está em região provável de fundo ou de topo, listando os sinais presentes.
arquivos: [public/components/price-chart/signals/signals.js]
rotas: []
eventos: []
storage: []
---

# Sinais de compra e venda

> **Estado: em desenvolvimento.** A etapa 1 está pronta: o núcleo de cálculo (`signals/signals.js`) com tendência por médias, RSI, esticagem e o placar de região, com testes. **Ainda não há nada na tela**: a carga dos dados e a interface são a etapa 2. O andamento fica em [planejamento.md](planejamento.md), e este doc é atualizado a cada etapa concluída.

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

Definido em 25/11/2026, a partir de um esboço sobre a tela:

- **Campo resumido** no cabeçalho do gráfico, à direita das informações de preço (`#price-chart-info`: preço atual, médios, vs. preço médio), no espaço livre da mesma linha. Mostra só o essencial: tendência D e S e a região com o placar.
- **Clicar no campo abre uma janelinha flutuante** logo abaixo dele, por cima do gráfico e da watchlist, com os detalhes: os sinais agrupados (tendência, fundo/topo, contexto), cada um com valor, duração e percentil, e os indisponíveis com o motivo.
- Fecha com clique fora ou Esc, como as caixas de engrenagem dos painéis (`.fp-settings`).

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

- **Núcleo puro (implementado):** `public/components/price-chart/signals/signals.js`, sem DOM, sem `fetch` e sem ler o relógio. Recebe as velas D e S e o instante `now` e devolve o resultado. Testado em `test/public/signals.test.js`. Reaproveita `movingAverage` e `rsi`; as séries opcionais (Fear & Greed, funding, liquidações) entram nas etapas 3 e 4.
  - `analyzeSignals({ asset, daily, weekly, now }, cfg?)`: a análise completa.
  - `trendSignal`, `rsiSignal`, `stretchSignal` `(points, "d" | "w", now, cfg?)`: um sinal cada.
  - `regionOf(signals, cfg?)`: o placar de confluência.
  - `lastClosedIndex`, `streak`, `percentileRank`: auxiliares.
  - `SIGNAL_DEFAULTS`: os limiares fixos da v1. As funções aceitam outra configuração no último parâmetro (os testes usam médias curtas).
- **Carga dos dados (planejada, etapa 2)** no front, por moeda, independente das camadas ligadas: velas `1d` (até 3 páginas, cerca de 8 anos, para os percentis) e `1w` (1 página cobre todo o histórico), mais Fear & Greed, funding e liquidações quando disponíveis. Usa os caches que já existem (`getKlines`, `futCache`, `liqRealCache`, `view.fng`).
- **Componente (planejado, etapa 2)** do campo resumido e da janela flutuante, em módulo próprio (o `PriceChartPanel.js` já é grande; ver [debitos-tecnicos](../debitos-tecnicos.md)).

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

## Decisões tomadas

| Data | Decisão |
|---|---|
| 25/11/2026 | Foco em Diário e Semanal. 4h e Mensal só como refinamento, em visão alternativa, se valer a pena |
| 25/11/2026 | Interface: campo resumido no cabeçalho, que expande numa janelinha flutuante ao clicar |
| 25/11/2026 | Limiares fixos com bons padrões na v1 |
| 25/11/2026 | Conjunto da v1: RSI D/S, Fear & Greed, esticagem da média com percentil, liquidações, tendência por médias, MACD semanal, divergência de RSI e funding |
| 25/11/2026 | Registrar para a v2: tela de varredura, reaproveitamento da análise feita no gráfico e backtest dos sinais |

Pendências de decisão estão em [planejamento.md](planejamento.md#pendências-de-decisão).
