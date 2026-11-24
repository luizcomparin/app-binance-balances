---
titulo: Watchlist e seletor de moeda
resumo: Lista lateral de moedas da carteira (preço, 24h, cor de indicação, arrastar para reordenar) e seletor com busca no título do gráfico; mesma ordem e cores nos dois.
arquivos: [public/components/price-chart/watchlist.js, public/components/price-chart/assetPicker.js, public/components/price-chart/chartQuote.js, public/components/price-chart/PriceChartPanel.js]
rotas: [GET /balances]
eventos: [BALANCES_UPDATED]
storage: [priceChartWatchlistOrder, priceChartWatchlistOpen, priceChartWatchlistColors, priceChartAsset]
---

# Watchlist e seletor de moeda

## Watchlist (`watchlist.js`)

- O botão ☰ (`#price-chart-watchlist-btn`) mostra ou esconde a lista `#price-chart-watchlist`. O estado fica lembrado.
- Cada linha mostra a moeda, `USDT`, o preço e a variação de 24h. A moeda aberta fica destacada.
- Clicar abre a moeda. **Arrastar** reorganiza a lista (salva).
- A **bolinha** abre o seletor de cor nativo (cor de indicação). O **botão direito** na bolinha tira a cor.
- `watchlistAssets()`: as moedas de `state.currentAssets` **sem USDT e sem BRL**, mais a entrada **USDT / BRL**, primeiro na ordem salva e depois as novas por valor em carteira. `watchlistColors()`.
- **USDT / BRL** (`usdtBrlEntry`): entra no lugar do antigo BRL/USDT. Tem `asset: "USDT"`, preço `state.usdtBrlPrice` e 24h `state.usdtBrlChange24hPct` (de `usdt_brl_change_24h_pct` em `/balances`). A participação e o valor vêm do saldo de USDT (ou do de BRL, se não houver USDT). Sem cotação USDT/BRL ou sem nenhum dos dois saldos, não aparece.
- `initWatchlist({ getCurrent, onSelect })` devolve `{ refresh }`. O PriceChartPanel chama `refresh` em `BALANCES_UPDATED` e ao abrir uma moeda. Com a lista fechada, o render é pulado.

## Seletor do título (`assetPicker.js`)

- O botão "XRP / USDT ▾" (`#price-chart-title-btn`) abre `#asset-picker`, com busca (`#asset-picker-search`) e lista (`#asset-picker-list`).
- Teclado: ↑ ↓ navegam, Enter escolhe, Esc fecha só a lista. Clique fora também fecha.
- Usa `watchlistAssets()` e `watchlistColors()`, portanto a mesma ordem e as mesmas cores. Mostra %, USDT e 24h. O USDT aparece como "USDT/BRL" e é encontrado também pela busca "BRL".

## Cotação do gráfico (`chartQuote.js`)

Funções puras com a regra de qual moeda de cotação o gráfico usa:

- `quoteOf(asset)`: `"BRL"` para o USDT, `"USDT"` para as demais. `pairLabel(asset, sep)`: "XRP/USDT", "USDT/BRL".
- `chartAssetOf(asset)`: BRL → USDT. `openPriceChart("BRL")` (ex.: link do BRL na aba Saldos ou `priceChartAsset` antigo) abre o USDT/BRL.
- `orderPriceOnChart` e `executedTotalOnChart`: preço das ordens abertas e total das executadas na cotação do gráfico. Ordem na própria cotação do gráfico (ex.: `USDTBRL` no USDT/BRL) usa o valor dela, sem conversão. Outra cotação converte pelo valor em USDT (no USDT/BRL, × `state.usdtBrlPrice`).
- Usadas pelas linhas de ordens abertas e marcadores (`chartData.js`), tooltips, título, resumo, "Preço atual" e DCA. Preço médio, médios projetados e simulador dependem do P&L, que não existe para o USDT: ficam desabilitados no USDT/BRL. Painéis de futuros, mapa de liquidação e liquidações reais ficam indisponíveis (não há perpétuo do USDT).
- `initAssetPicker({ getCurrent, onSelect })` devolve `{ close, isOpen }`.

## Persistência

`priceChartWatchlistOrder`, `priceChartWatchlistOpen`, `priceChartWatchlistColors` e `priceChartAsset` (última moeda vista, gravada por `openPriceChart`).

## Casos de borda

Antes de os saldos chegarem, as duas listas mostram "Saldos ainda carregando...".

## Como verificar

1. Abra a lista, arraste uma moeda, marque uma cor e recarregue: a ordem e a cor persistem.
1. A lista mostra "USDT BRL" (e não BRL/USDT), com preço em reais. Clicar abre "USDT / BRL" com as velas do par, as ordens abertas e os marcadores das ordens executadas do `USDTBRL` nos preços em BRL.
2. Abra o seletor do título: a mesma ordem e as mesmas cores aparecem lá.
