// Carrega /positions (preço médio e P&L por moeda) para o `state` e avisa com POSITIONS_UPDATED.
// É lento (histórico de trades), então roda em paralelo; tabela de saldos e gráfico de preço escutam o evento.
import { fetchPositions } from "../api/binance.js";
import { state } from "./state.js";
import { emit, POSITIONS_UPDATED } from "./events.js";

let request = null;

export function loadPositions() {
  if (request) return request;

  state.positionsLoading = true;
  state.positionsError = null;
  state.positionsFailedPairs = 0;
  emit(POSITIONS_UPDATED);

  request = fetchPositions()
    .then((data) => {
      state.positions = data.positions || {};
      state.positionsTotals = data.totals || null;
      state.positionsFailedPairs = data.errors?.length || 0;
    })
    .catch((e) => {
      state.positionsTotals = null;
      state.positionsError = e.message;
    })
    .finally(() => {
      request = null;
      state.positionsLoading = false;
      emit(POSITIONS_UPDATED);
    });

  return request;
}
