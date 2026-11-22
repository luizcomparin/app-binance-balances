// Cards fixos do topo: total, USDT, BTC, XRP, ETH e "Outros". Redesenha quando os saldos chegam.
import { state } from "../../core/state.js";
import { formatSigned, signClass } from "../../core/format.js";
import { setHtml, setText } from "../../core/dom.js";
import { BALANCES_UPDATED, on } from "../../core/events.js";

// moedas com card fixo no topo (o restante entra em "Outros")
const FIXED_CARD_ASSETS = ["USDT", "BTC", "XRP", "ETH"];

export function initStatGrid() {
  on(BALANCES_UPDATED, renderStatCards);
}

function brlText(usdtValue) {
  if (!state.usdtBrlPrice) return "--";
  return `${(usdtValue * state.usdtBrlPrice).toFixed(2).formatCurrency()} BRL`;
}

function change24hHtml(pct, usdt) {
  if (pct === null || pct === undefined) return "";
  const usdtPart =
    usdt === null || usdt === undefined ? "" : ` (${formatSigned(usdt)} USDT)`;
  return `<span class="${signClass(pct)}">${formatSigned(pct)}%</span>${usdtPart} <span class="muted">24h</span>`;
}

function renderStatCards(data) {
  const totalUSDT = Number(data.total_usdt || 0);

  setText("total-balance", `${totalUSDT.toFixed(2).formatCurrency()} USDT`);
  setText("total-brl", brlText(totalUSDT));
  setHtml("total-change-24h", change24hHtml(data.change_24h_pct, data.change_24h_usdt));

  for (const symbol of FIXED_CARD_ASSETS) {
    const key = symbol.toLowerCase();
    const asset = data.assets.find((a) => a.asset === symbol);
    const usdt = Number(asset?.totalUSDT || 0);

    setText(`${key}-percent`, `${asset?.pct.toFixed(2) || 0}%`);
    setText(`${key}-usdt`, `${usdt.toFixed(2).formatCurrency()} USDT`);
    setText(`${key}-brl`, brlText(usdt));
    setHtml(`${key}-change-24h`, change24hHtml(asset?.change24hPct, asset?.change24hUSDT));
  }

  const others = data.assets.filter((a) => !FIXED_CARD_ASSETS.includes(a.asset));
  const othersUSDT = others.reduce((acc, a) => acc + a.totalUSDT, 0);
  const othersPct = others.reduce((acc, a) => acc + a.pct, 0);
  const othersWithChange = others.filter((a) => a.change24hUSDT !== null);
  const othersChangeUSDT = othersWithChange.reduce((acc, a) => acc + a.change24hUSDT, 0);
  const othersValue24hAgo = othersWithChange.reduce(
    (acc, a) => acc + a.totalUSDT - a.change24hUSDT,
    0
  );

  setText("others-percent", `${othersPct.toFixed(2)}%`);
  setText("others-usdt", `${othersUSDT.toFixed(2).formatCurrency()} USDT`);
  setText("others-brl", brlText(othersUSDT));
  setHtml(
    "others-change-24h",
    change24hHtml(
      othersValue24hAgo ? (othersChangeUSDT / othersValue24hAgo) * 100 : null,
      othersWithChange.length ? othersChangeUSDT : null
    )
  );
}
