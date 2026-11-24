// Aba "Saldos por moeda": tabela de saldos com preço médio/P&L e o resumo de P&L do cabeçalho.
// Carrega /balances e avisa os outros componentes (cards, gráficos, faixa de ativos, simulação)
// com BALANCES_UPDATED; o P&L chega depois, via POSITIONS_UPDATED.
import { fetchBalances } from "../../api/binance.js";
import { escapeHtml } from "../../core/dom.js";
import { state } from "../../core/state.js";
import { formatPrice, formatQty, formatSigned, signClass } from "../../core/format.js";
import { toggleSort, compareValues } from "../../core/sort.js";
import { BALANCES_UPDATED, emit, on, POSITIONS_UPDATED } from "../../core/events.js";
import { loadPositions } from "../../core/positions.js";

const BALANCE_COLUMNS = 12;
// abaixo disso, parte relevante da quantidade não veio de trades (depósito, Convert, Earn...)
const LOW_COVERAGE = 0.95;
// "Visão simplificada" (esconde Qtd, Preço atual, 24h, P&L e Realizado), lembrada no navegador
const SIMPLE_VIEW_KEY = "balances-simple-view";

export function initBalancesPanel() {
  on(POSITIONS_UPDATED, onPositionsUpdated);
  initSimpleView();
}

function initSimpleView() {
  const input = document.getElementById("balances-simple");
  const table = document.getElementById("balances-table");
  if (!input || !table) return;
  try {
    input.checked = localStorage.getItem(SIMPLE_VIEW_KEY) === "1";
  } catch {
    // sem armazenamento: começa desligada
  }
  const apply = () => table.classList.toggle("is-simple", input.checked);
  apply();
  input.addEventListener("change", () => {
    apply();
    try {
      localStorage.setItem(SIMPLE_VIEW_KEY, input.checked ? "1" : "0");
    } catch {
      // sem armazenamento: vale só até recarregar
    }
  });
}

export async function loadBalances() {
  const tbody = document.querySelector("#table-body-balances");

  if (tbody) {
    tbody.innerHTML = `<tr><td colspan='${BALANCE_COLUMNS}'>Carregando...</td></tr>`;
  }

  // P&L é mais lento (histórico de trades): dispara em paralelo sem travar a tela
  loadPositions();

  try {
    const data = await fetchBalances(); // erro da API vira exceção (getJson)

    state.usdtBrlPrice = Number(data.usdt_brl_price || 0);
    state.usdtBrlChange24hPct = data.usdt_brl_change_24h_pct ?? null;
    state.currentAssets = data.assets.slice();
    mergePositions();

    renderBalances();
    renderUnpricedNote(data.unpriced);
    renderPnlSummary();
    emit(BALANCES_UPDATED, data);
  } catch (e) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${BALANCE_COLUMNS}" style="color:red;">Erro: ${escapeHtml(e.message || e)}</td></tr>`;
    }
  }
}

// Posições começaram a carregar, chegaram ou falharam
function onPositionsUpdated() {
  setPnlSummaryLoading(state.positionsLoading);
  renderPositionsStatus();
  if (state.positionsLoading) return;

  if (state.positionsError) {
    const detail = document.getElementById("pnl-detail");
    if (detail) {
      detail.innerText = "Falha ao calcular o P&L.";
      detail.hidden = false;
    }
    return;
  }

  mergePositions();
  renderBalances();
  renderPnlSummary();
}

function renderPositionsStatus() {
  const status = document.getElementById("positions-status");
  if (!status) return;

  const error = !state.positionsLoading && state.positionsError;
  const failed = !state.positionsLoading && !error ? state.positionsFailedPairs : 0;
  status.classList.toggle("error", !!error);
  status.hidden = !error && !failed;
  status.textContent = error
    ? `Não foi possível calcular o P&L: ${error}`
    : failed
      ? `P&L calculado, mas ${failed} par(es) falharam ao buscar trades.`
      : "";
}

// Junta os dados de /positions em cada linha de saldo (para exibir e ordenar)
function mergePositions() {
  state.currentAssets = state.currentAssets.map((asset) => {
    const p = state.positions[asset.asset];
    return {
      ...asset,
      avgBuyPriceUSDT: p?.avgBuyPriceUSDT ?? null,
      costBasisUSDT: p?.costBasisUSDT ?? null,
      unrealizedPnlUSDT: p?.unrealizedPnlUSDT ?? null,
      unrealizedPnlPct: p?.unrealizedPnlPct ?? null,
      realizedPnlUSDT: p ? p.realizedPnlUSDT : null,
      coverage: p?.coverage ?? null,
      tradesCount: p?.tradesCount ?? null,
    };
  });
}

function setPnlSummaryLoading(isLoading) {
  document.getElementById("pnl-summary")?.classList.toggle("is-loading", isLoading);
}

// Resumo de P&L no cabeçalho da aba "Saldos por moeda"
function renderPnlSummary() {
  const totals = state.positionsTotals;
  const valueEl = document.getElementById("pnl-total");
  const pctEl = document.getElementById("pnl-pct");
  const brlEl = document.getElementById("pnl-brl");
  const detailEl = document.getElementById("pnl-detail");
  const costEl = document.getElementById("pnl-cost");
  const realizedEl = document.getElementById("pnl-realized");
  if (!totals || !valueEl) return;

  const cls = signClass(totals.unrealizedPnlUSDT);
  valueEl.className = cls;
  valueEl.innerText = `${formatSigned(totals.unrealizedPnlUSDT)} USDT`;

  if (pctEl) {
    pctEl.className = cls;
    pctEl.innerText =
      totals.unrealizedPnlPct === null ? "" : `(${formatSigned(totals.unrealizedPnlPct)}%)`;
  }
  if (brlEl) {
    brlEl.innerText = state.usdtBrlPrice
      ? `${formatSigned(totals.unrealizedPnlUSDT * state.usdtBrlPrice)} BRL`
      : "--";
  }
  if (detailEl) detailEl.hidden = true;
  if (costEl) costEl.innerText = `${totals.costBasisUSDT.formatCurrency()} USDT`;
  if (realizedEl) {
    realizedEl.className = signClass(totals.realizedPnlUSDT);
    realizedEl.innerText = `${formatSigned(totals.realizedPnlUSDT)} USDT`;
  }
}

function renderUnpricedNote(unpriced = []) {
  const note = document.getElementById("unpriced-note");
  if (!note) return;

  if (!unpriced.length) {
    note.hidden = true;
    note.textContent = "";
    return;
  }

  const list = unpriced.map((u) => `${u.asset} (${u.qty})`).join(", ");
  note.textContent = `Sem cotação encontrada, fora do total: ${list}`;
  note.hidden = false;
}

export function sortBalances(key) {
  toggleSort(state.balanceSort, key);
  renderBalances();
}

function renderBalances() {
  const tbody = document.querySelector("#table-body-balances");
  if (!tbody) return;

  const assets = Array.isArray(state.currentAssets)
    ? [...state.currentAssets]
    : [];

  if (state.balanceSort?.key) {
    const { key, asc } = state.balanceSort;
    assets.sort((a, b) => {
      // valores ausentes (sem P&L, ex.: USDT/BRL) sempre no fim
      const aMissing = a[key] === null || a[key] === undefined;
      const bMissing = b[key] === null || b[key] === undefined;
      if (aMissing || bMissing) return aMissing - bMissing;
      return compareValues(a[key], b[key], asc);
    });
  }

  if (!assets.length) {
    tbody.innerHTML = `<tr><td colspan='${BALANCE_COLUMNS}'>Nenhum saldo encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = assets
    .map((asset) => {
      const lowCoverage =
        asset.avgBuyPriceUSDT !== null &&
        asset.coverage !== null &&
        asset.coverage < LOW_COVERAGE;
      const coverageHint = lowCoverage
        ? ` <span class="coverage-warn" title="Só ${(asset.coverage * 100).toFixed(0)}% da quantidade atual vem de trades na Binance; o restante (depósito, Convert, Earn...) foi considerado com o mesmo preço médio.">⚠</span>`
        : "";
      const pnlClass = signClass(asset.unrealizedPnlUSDT);
      const change24h =
        asset.change24hPct === null || asset.change24hPct === undefined
          ? "--"
          : `${formatSigned(asset.change24hPct)}%`;

      return `
          <tr>
            <td>${
              asset.asset === "USDT"
                ? asset.asset
                : `<button class="asset-link" title="Ver gráfico de preço" onclick="openPriceChart('${asset.asset}')">${asset.asset}</button>`
            }</td>
            <td>${asset.pct.toFixed(2)}%</td>
            <td class="col-detail">${formatQty(asset.qty)}</td>
            <td class="col-detail">${formatPrice(asset.priceUSDT)}</td>
            <td class="col-detail ${signClass(asset.change24hPct)}">${change24h}</td>
            <td>${formatPrice(asset.avgBuyPriceUSDT)}${coverageHint}</td>
            <td>${asset.freeUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.lockedUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td>${asset.totalUSDT.toFixed(2).formatCurrency()} USDT</td>
            <td class="col-detail ${pnlClass}">${formatSigned(asset.unrealizedPnlUSDT)}</td>
            <td class="col-detail ${pnlClass}">${
              asset.unrealizedPnlPct === null ? "--" : `${formatSigned(asset.unrealizedPnlPct)}%`
            }</td>
            <td class="col-detail ${signClass(asset.realizedPnlUSDT)}">${formatSigned(asset.realizedPnlUSDT)}</td>
          </tr>
        `;
    })
    .join("");
}
