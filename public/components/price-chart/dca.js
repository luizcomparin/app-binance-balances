// Comparação com compra mensal fixa (DCA): funções puras, sem DOM.
// Pergunta: se o mesmo total que você investiu nesta moeda tivesse sido dividido em parcelas
// iguais, compradas uma vez por mês entre a sua primeira e a sua última compra, qual seria o
// preço médio? (mesma janela de tempo em que você decidiu as compras)

// Datas mensais a partir de `startMs`, mesmo dia do mês (ajustado em meses mais curtos), até `endMs`
export function monthlyDates(startMs, endMs) {
  const start = new Date(startMs);
  const dates = [];
  for (let i = 0; ; i++) {
    const y = start.getFullYear();
    const m = start.getMonth() + i;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(start.getDate(), lastDay), start.getHours(), start.getMinutes());
    if (d.getTime() > endMs) break;
    dates.push(d.getTime());
  }
  return dates;
}

// Fechamento da última vela diária com time <= ms (busca binária); null se antes do histórico
function closeAt(dailyPoints, ms) {
  if (!dailyPoints.length || ms < dailyPoints[0].time) return null;
  let lo = 0;
  let hi = dailyPoints.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (dailyPoints[mid].time <= ms) lo = mid;
    else hi = mid - 1;
  }
  return dailyPoints[lo].close;
}

// Suas compras executadas da moeda (vendas ficam de fora da comparação)
export function buysOf(myOrders, asset) {
  return (myOrders || []).filter((o) => o.baseAsset === asset && o.side === "BUY" && o.qty > 0 && o.totalUSDT > 0);
}

/**
 * Compara suas compras com a compra mensal fixa do mesmo total.
 * Retorna null sem compras; { tooShort: true, ... } com menos de 2 meses entre a 1ª e a última; senão
 * { invested, qty, yourAvg, start, end, months, monthly, dcaAvg, dcaQty, diffPct }
 *   diffPct < 0 → seu preço médio ficou abaixo do automático (melhor)
 */
export function dcaComparison(buys, dailyPoints) {
  if (!buys.length) return null;
  const invested = buys.reduce((a, o) => a + o.totalUSDT, 0);
  const qty = buys.reduce((a, o) => a + o.qty, 0);
  const yourAvg = invested / qty;
  const start = Math.min(...buys.map((o) => o.time));
  const end = Math.max(...buys.map((o) => o.time));

  const dates = monthlyDates(start, end);
  const base = { invested, qty, yourAvg, start, end, months: dates.length };
  if (dates.length < 2) return { ...base, tooShort: true };

  const prices = dates.map((t) => closeAt(dailyPoints, t));
  if (prices.some((p) => !p)) return null; // histórico diário não cobre o período
  const monthly = invested / dates.length;
  const dcaQty = prices.reduce((a, p) => a + monthly / p, 0);
  const dcaAvg = invested / dcaQty;

  return { ...base, monthly, dcaAvg, dcaQty, diffPct: ((yourAvg - dcaAvg) / dcaAvg) * 100 };
}
