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
