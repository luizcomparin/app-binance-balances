---
titulo: Carteira, cards do topo e faixa de ativos
resumo: /balances calcula a carteira em USDT/BRL com variação de 24h; os cards fixos (total, USDT, BTC, XRP, ETH, Outros) e a faixa "Ativos" mostram o resultado.
arquivos: [server/services/wallet.js, server/binance/market.js, server/binance/account.js, public/components/stats/StatGrid.js, public/components/stats/StatGrid.html, public/components/stats/StatGrid.css, public/components/asset-strip/AssetStrip.js, public/components/asset-strip/AssetStrip.html, public/components/asset-strip/AssetStrip.css, public/components/topbar/Topbar.html, public/components/topbar/Topbar.css, public/components/topbar/Topbar.js]
rotas: [GET /balances]
eventos: [BALANCES_UPDATED]
storage: []
---

# Carteira, cards e faixa de ativos

## O que faz

- **Topbar:** título, o texto "Atualizado há X min", o botão **Atualizar**, "Simular Valorização" e ⚙ Configurações.
  - **Atualizar** recarrega de uma vez tudo o que a tela mostra: carteira + P&L, ordens abertas, ordens executadas (se a aba já foi aberta) e, no gráfico de preço, a moeda aberta (ordens abertas, pontos das ordens executadas, aba de histórico visível, as camadas ligadas em ⚙ (faixa estatística, compra mensal fixa, mapa de liquidação, dados de futuros e liquidações) e, com a aba na tela, as velas mantendo o trecho visível).
  - "Atualizado há X min" mostra quando a carteira chegou pela última vez (boot, Atualizar ou recarga depois de salvar a chave). O texto é refeito a cada 30 s, e o horário exato fica no `title`.
- **Cards do topo:**
  - **Total da carteira:** USDT, BRL e variação de 24h.
  - **Um card fixo para cada uma de USDT, BTC, XRP e ETH:** % da carteira, USDT, BRL e 24h.
  - **Outros:** a soma do resto.
- **Faixa "Ativos":** uma pílula por moeda com %, USDT, BRL e 24h, ordenada pelo maior valor.

## Página

- `Topbar.js` → `initTopbar()` liga `#refresh-all-btn` a `refreshAll()` e escuta `BALANCES_UPDATED` para atualizar `#last-update`.
  - `refreshAll()` chama em paralelo `loadBalances()`, `loadOrders()`, `refreshExecutedOrders()` (ExecutedOrdersPanel) e `refreshPriceChart()` (PriceChartPanel). Enquanto roda, o botão fica desabilitado com o ícone girando; cliques repetidos esperam a mesma atualização.
  - `refreshPriceChart()` descarta o cache do cliente da moeda (`invalidateAssetCache` em `chartData.js`, `reloadHistory`/`reloadTrades` nas tabelas) antes de buscar de novo. O cache curto do server continua valendo (ver [decisoes](../decisoes.md)).
- "Simular Valorização" usa `onclick` → `window.openSimulationDialog`. O botão `#settings-btn` é ligado pelo `SettingsModal.js`.
- `StatGrid.js` → `initStatGrid()` escuta `BALANCES_UPDATED` → `renderStatCards(data)`.
  - A constante `FIXED_CARD_ASSETS = ["USDT", "BTC", "XRP", "ETH"]` é **intencional** (ver [decisoes](../decisoes.md)).
  - Ids: `#total-balance`, `#total-brl`, `#total-change-24h` e, para cada moeda, `#<moeda>-percent|usdt|brl|change-24h` (em minúsculas), além de `#others-*`.
  - Os 24h de "Outros" são recalculados no front como (Σ variação) ÷ (Σ valor de 24h atrás).
- `AssetStrip.js` → `initAssetStrip()` escuta `BALANCES_UPDATED` → `renderAssetStrip(assets)` em `#asset-strip-list`.
- O BRL é sempre `valor USDT × state.usdtBrlPrice`; sem cotação, mostra `--`.

## Server

`GET /balances` → `services/wallet.js` `buildWalletData()`:

1. `getAccountBalances()` (`/api/v3/account`, 15 s) e `getTickers24h()` (`ticker/24hr?type=MINI`, 15 s), em paralelo.
2. Considera só os saldos com `free > 0` ou `locked > 0`.
3. Preço de cada moeda: `getPriceInUSDT(asset, prices)` (par direto → invertido → ponte → `LD*` → BUSD=1). Sem preço, vai para `unpriced`.
4. A variação de 24h usa o mesmo `getPriceInUSDT` sobre os `openPrices` do ticker 24h (para o BRL, inclui a variação do câmbio).
5. `change_24h_pct` da carteira = Σ variação ÷ Σ valor de 24h atrás, com as **quantidades atuais** (ignora trades feitos nas 24 h).
6. `pct` = participação no total. A ordenação é por `pct` desc.

O formato da resposta está em [api.md](../referencia/api.md#get-balances).

## Fluxo

1. Quem dispara: `index.js` no boot, o botão "Atualizar" do topo ou a recarga depois de salvar a chave.
2. `BalancesPanel.loadBalances()` busca `/balances`, preenche `state.usdtBrlPrice` e `state.currentAssets` e emite `BALANCES_UPDATED`.
3. StatGrid, AssetStrip, ChartsPanel, orderSimulation e a watchlist do gráfico redesenham.

O dono do fetch de `/balances` é o BalancesPanel (ver [saldos-e-pnl](saldos-e-pnl.md)).

## Casos de borda

- Moeda sem nenhum caminho de preço para USDT: fica fora do total e aparece na nota `#unpriced-note` da aba Saldos.
- Saldos `LDxxx` (Simple Earn) são avaliados como `xxx`.
- Card de uma moeda fixa que não está na carteira: mostra `0%` / `0,00 USDT`.
- Sem `USDTBRL`: os campos BRL ficam `--`.

## Checklist ao alterar

- Campo novo em `/balances`: atualize [api.md](../referencia/api.md), o render de quem usa e verifique os 5 ouvintes de `BALANCES_UPDATED`.
- Não troque os cards fixos por dinâmicos sem pedido explícito.

## Como verificar

`npm run dev`, abra `/site` e confira:

- se o total do card bate com a soma da aba Saldos;
- se o "Atualizar" atualiza cards, faixa, gráficos, aba Saldos, ordens abertas, ordens executadas (se já abertas), as ordens do gráfico de preço e as camadas ligadas (ex.: o DCA reflete uma compra nova);
- se o botão mostra "Atualizando..." e fica desabilitado durante a carga;
- se "Atualizado agora" aparece depois da carga e vira "há 1 min" após um minuto;
- se o BRL aparece.
