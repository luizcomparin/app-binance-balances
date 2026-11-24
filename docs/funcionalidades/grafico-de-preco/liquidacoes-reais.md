---
titulo: Liquidações reais (Coinalyze)
resumo: Painel com as liquidações que de fato aconteceram nos perpétuos USDT da moeda (Binance + Bybit + OKX), por vela; exige chave gratuita da Coinalyze.
arquivos: [server/services/liquidations.js, server/coinalyze/client.js, server/config.js, public/components/price-chart/chart/futuresPanes.js, public/components/price-chart/PriceChartPanel.js]
rotas: [GET /liquidations/:asset]
eventos: [COINALYZE_KEY_CHANGED]
storage: [priceChartRealLiquidations]
---

# Liquidações reais

## O que faz

O checkbox `#price-chart-liqreal` ("Liquidações") adiciona um painel abaixo do gráfico, depois do volume, do CVD, do RSI e do MACD e antes dos de futuros (a ordem dos checkboxes):

- barras **vermelhas para cima**: longs liquidados (vendas forçadas);
- barras **verdes para baixo**: shorts liquidados (compras forçadas);
- no título: Longs, Shorts e a divisão por corretora na vela sob a mira.

**Sem chave da Coinalyze**, ligar a camada abre as Configurações direto na seção da Coinalyze (`openSettings("coinalyze")`). O texto do checkbox avisa "configure a chave", "chave recusada", "sem contrato perpétuo" ou "indisponíveis".

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

- `PriceChartPanel.liquidationsForChart()` / `loadLiquidations()` funcionam como os painéis de futuros, com chave `asset|vela` e `liqRealCache` de 5 min. Só ficam em cache as respostas com sucesso ou `no-market`; sem chave ou com erro, tenta de novo na próxima vez.
- `COINALYZE_KEY_CHANGED` → `reloadLiquidations()` limpa o cache e recarrega.
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
