export const state = {
  currentAssets: [],
  usdtBrlPrice: 0,
  usdtBrlChange24hPct: null, // variação de 24h do par USDT/BRL (watchlist do gráfico de preço)
  positions: {},
  positionsTotals: null,
  positionsLoading: false,
  positionsError: null, // mensagem se /positions falhou
  positionsFailedPairs: 0, // pares cujo histórico de trades falhou (P&L parcial)
  orders: [],
  filteredOrders: [],
  orderSort: { key: null, asc: true },
  balanceSort: { key: null, asc: true },
};
