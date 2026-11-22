---
titulo: Watchlist e seletor de moeda
resumo: Lista lateral de moedas da carteira (preço, 24h, cor de indicação, arrastar para reordenar) e seletor com busca no título do gráfico; mesma ordem e cores nos dois.
arquivos: [public/components/price-chart/watchlist.js, public/components/price-chart/assetPicker.js, public/components/price-chart/PriceChartPanel.js]
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
- `watchlistAssets()`: as moedas de `state.currentAssets` **sem USDT**, primeiro na ordem salva e depois as novas por valor em carteira. `watchlistColors()`.
- `initWatchlist({ getCurrent, onSelect })` devolve `{ refresh }`. O PriceChartPanel chama `refresh` em `BALANCES_UPDATED` e ao abrir uma moeda. Com a lista fechada, o render é pulado.

## Seletor do título (`assetPicker.js`)

- O botão "XRP / USDT ▾" (`#price-chart-title-btn`) abre `#asset-picker`, com busca (`#asset-picker-search`) e lista (`#asset-picker-list`).
- Teclado: ↑ ↓ navegam, Enter escolhe, Esc fecha só a lista. Clique fora também fecha.
- Usa `watchlistAssets()` e `watchlistColors()`, portanto a mesma ordem e as mesmas cores. Mostra %, USDT e 24h.
- `initAssetPicker({ getCurrent, onSelect })` devolve `{ close, isOpen }`.

## Persistência

`priceChartWatchlistOrder`, `priceChartWatchlistOpen`, `priceChartWatchlistColors` e `priceChartAsset` (última moeda vista, gravada por `openPriceChart`).

## Casos de borda

Antes de os saldos chegarem, as duas listas mostram "Saldos ainda carregando...".

## Como verificar

1. Abra a lista, arraste uma moeda, marque uma cor e recarregue: a ordem e a cor persistem.
2. Abra o seletor do título: a mesma ordem e as mesmas cores aparecem lá.
