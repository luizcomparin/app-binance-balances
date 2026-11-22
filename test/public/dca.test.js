// Comparação com compra mensal fixa (public/components/price-chart/dca.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buysOf, dcaComparison, monthlyDates } from "../../public/components/price-chart/dca.js";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `esperado ${b}, veio ${a}`);
const local = (y, m, d) => new Date(y, m, d).getTime(); // meses de 0 a 11, fuso local (igual a dca.js)

test("monthlyDates: mesmo dia do mês, ajustado em meses mais curtos", () => {
  const dates = monthlyDates(local(2026, 0, 31), local(2026, 3, 30));
  assert.deepEqual(dates, [local(2026, 0, 31), local(2026, 1, 28), local(2026, 2, 31), local(2026, 3, 30)]);
});

test("buysOf: só compras executadas da moeda com valor", () => {
  const orders = [
    { baseAsset: "X", side: "BUY", qty: 1, totalUSDT: 10 },
    { baseAsset: "X", side: "SELL", qty: 1, totalUSDT: 10 },
    { baseAsset: "Y", side: "BUY", qty: 1, totalUSDT: 10 },
    { baseAsset: "X", side: "BUY", qty: 1, totalUSDT: null }, // sem cotação
  ];
  assert.equal(buysOf(orders, "X").length, 1);
  assert.deepEqual(buysOf(null, "X"), []);
});

// velas diárias de jan a abr/2026 no fuso local: fevereiro a 50, o resto a 100
const daily = [];
for (const d = new Date(2026, 0, 1); d <= new Date(2026, 3, 1); d.setDate(d.getDate() + 1)) {
  daily.push({ time: d.getTime(), close: d.getMonth() === 1 ? 50 : 100 }); // dia a dia no calendário (vale com horário de verão)
}

test("dcaComparison: o mesmo total em parcelas mensais iguais", () => {
  const buys = [
    { time: local(2026, 0, 1), qty: 1, totalUSDT: 100 },
    { time: local(2026, 2, 1), qty: 1, totalUSDT: 100 },
  ];
  const r = dcaComparison(buys, daily);
  close(r.invested, 200);
  close(r.yourAvg, 100);
  assert.equal(r.months, 3, "jan, fev e mar");
  close(r.monthly, 200 / 3);
  // parcelas a 100, 50 e 100 → 2,667 moedas → médio de 75
  close(r.dcaAvg, 75);
  close(r.diffPct, ((100 - 75) / 75) * 100);
  assert.ok(r.diffPct > 0, "positivo = suas compras saíram mais caras");
});

test("dcaComparison: casos sem comparação", () => {
  assert.equal(dcaComparison([], daily), null, "sem compras");
  const mesmoMes = [
    { time: local(2026, 0, 5), qty: 1, totalUSDT: 100 },
    { time: local(2026, 0, 20), qty: 1, totalUSDT: 100 },
  ];
  assert.equal(dcaComparison(mesmoMes, daily).tooShort, true, "menos de 2 datas mensais");
  const antesDoHistorico = [
    { time: local(2025, 10, 1), qty: 1, totalUSDT: 100 },
    { time: local(2026, 1, 1), qty: 1, totalUSDT: 100 },
  ];
  assert.equal(dcaComparison(antesDoHistorico, daily), null, "histórico diário não cobre o período");
});
