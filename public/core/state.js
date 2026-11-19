export const state = {
  currentAssets: [],
  usdtBrlPrice: 0,
  positions: {},
  positionsTotals: null,
  positionsLoading: false,
  positionsError: null, // mensagem se /positions falhou
  positionsFailedPairs: 0, // pares cujo histórico de trades falhou (P&L parcial)
  orders: [],
  filteredOrders: [],
  orderSort: { key: null, asc: true },
  balanceSort: { key: null, asc: true },
  pairs: [],
  totalsByPair: {},
};
