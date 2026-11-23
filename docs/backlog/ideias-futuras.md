# Ideias futuras

Funcionalidades já avaliadas e ainda não implementadas.

## Liquidez real no livro de ofertas (paredes de ordens)

Mostrar, no gráfico de preço, onde há grandes ordens limite paradas agora: blocos de compra abaixo do preço e de venda acima. Diferente do mapa de liquidação (que é uma estimativa), aqui o dado é real.

- **Fonte:** API pública da Binance, sem chave. `GET /api/v3/depth?symbol=BTCUSDT&limit=5000` (spot) ou `GET /fapi/v1/depth?symbol=BTCUSDT&limit=1000` (futuros), até 5000 níveis de preço de cada lado.
- **No gráfico:** barras horizontais saindo do eixo de preço, mais largas onde há mais dinheiro parado (agrupando os níveis em faixas de ~0,1–0,25% do preço), ou destacar só as maiores paredes ("parede de compra de 2,3M USDT em 58.000").
- **Prós:** dado real e implementação simples (uma requisição por atualização).
- **Contras:**
  - É uma foto do momento. Paredes podem ser canceladas a qualquer hora, e algumas são falsas (*spoofing*).
  - Para um mapa de calor ao longo do tempo (estilo Bookmap), o servidor precisaria gravar fotos periódicas do livro, e o histórico só existiria a partir daí.

## Mais dados da Coinalyze no gráfico de preço

Hoje o app usa da Coinalyze só `/exchanges`, `/future-markets` e `/liquidation-history` (camada de liquidações reais). Os painéis de OI, long/short e funding vêm da Binance fapi, que guarda só 30 dias nas séries `/futures/data/*` e não junta outras corretoras. A Coinalyze tem mais dados gratuitos que poderíamos usar.

- **Regras da API** (da especificação OpenAPI em `https://api.coinalyze.net/v1/doc/`):
  - Todos os endpoints são `GET`. A chave vai no header `api_key`, como já faz `server/coinalyze/client.js`.
  - O limite é de 40 chamadas por minuto, e **cada símbolo conta como uma chamada**. Cabem até 20 símbolos por requisição, separados por vírgula.
  - Os períodos aceitos são `1min`, `5min`, `15min`, `30min`, `1hour`, `2hour`, `4hour`, `6hour`, `12hour` e `daily`.
  - Os períodos intradiários guardam só de 1500 a 2000 pontos, e o mais antigo é apagado todo dia. O `daily` não é apagado.
  - `from` e `to` são em segundos UNIX e os dois limites entram no resultado. As respostas vêm em ordem crescente.
- **Endpoints ainda não usados:**
  - `/assets`: catálogo de ativos (`asset_category`: `Cryptocurrency` ou `TradFi`).
  - `/spot-markets`: mercados spot, com `has_buy_sell_data`.
  - `/open-interest` e `/open-interest-history`: OI atual e em OHLC (`o`, `h`, `l`, `c`), com `convert_to_usd`.
  - `/funding-rate` e `/funding-rate-history`: funding atual e histórico em OHLC.
  - `/predicted-funding-rate` e `/predicted-funding-rate-history`: funding previsto para o próximo período.
  - `/long-short-ratio-history`: `r` (razão), `l` (% de longs), `s` (% de shorts), nos mercados com `has_long_short_ratio_data`.
  - `/ohlcv-history`: velas de spot e futuros com `v`, `bv` (volume comprador), `tx` e `btx` (trades compradores). Venda = `v - bv` e `tx - btx`, onde `has_buy_sell_data` for `true`.
- **Ideias:**
  1. **OI agregado** (Binance + Bybit + OKX, como nas liquidações reais), com histórico diário longo em vez dos 30 dias da fapi.
  2. **Funding previsto** no painel de funding (atual e histórico).
  3. **Funding comparado ou agregado entre corretoras.**
  4. **Volume comprador × vendedor (delta / CVD)** em spot e futuros, a partir de `bv` no `/ohlcv-history`, num painel novo.
  5. **Long/short de outras corretoras**, além da Binance.
  6. **Basis** entre spot e perpétuo, ou entre corretoras, cruzando os `/ohlcv-history`.
  7. **Curva de basis dos futuros com vencimento** (`is_perpetual: false`, `expire_at`).
- **Contras:**
  - Precisa da chave da Coinalyze, que é opcional. Sem ela, o painel cai na Binance ou fica indisponível.
  - Somar 3 corretoras gasta 3 chamadas por série. Um painel com OI, funding, funding previsto e CVD agregados gastaria cerca de 12 das 38 chamadas por minuto que o limitador libera. Toda série nova precisa de `cached` com TTL de minutos.
  - O intradiário é curto (cerca de 2000 pontos): em 1h dá uns 83 dias, em 1min pouco mais de 1 dia.
