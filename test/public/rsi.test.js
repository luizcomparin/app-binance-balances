// RSI (public/components/price-chart/chart/rsi.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRsiSettings, rsi, RSI_DEFAULT } from "../../public/components/price-chart/chart/rsi.js";

test("normalizeRsiSettings: padrão, limites e valores inválidos", () => {
  assert.deepEqual(normalizeRsiSettings(null), RSI_DEFAULT);
  assert.deepEqual(normalizeRsiSettings({ period: 1, overbought: 120, oversold: 0, color: "x", opacity: 0 }), {
    period: 2,
    overbought: 99,
    oversold: 1,
    color: RSI_DEFAULT.color,
    opacity: 0.05,
  });
  assert.deepEqual(normalizeRsiSettings({ period: "21", overbought: 80.4, oversold: 20, color: "#112233", opacity: 0.5 }), {
    period: 21,
    overbought: 80,
    oversold: 20,
    color: "#112233",
    opacity: 0.5,
  });
  assert.equal(normalizeRsiSettings({ period: "abc" }).period, 14);
});

const pts = (closes) => closes.map((close) => ({ close }));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `esperado ${b}, veio ${a}`);

test("rsi: aquecimento com null e primeiro valor pela média simples", () => {
  // variações: +2, −1, +1 → altas 3/3 = 1, baixas 1/3 → RS = 3 → RSI = 75
  const r = rsi(pts([10, 12, 11, 12]), 3);
  assert.deepEqual(r.slice(0, 3), [null, null, null]);
  close(r[3], 75);
});

test("rsi: suavização de Wilder depois do primeiro valor", () => {
  // depois de altas 1 e baixas 1/3 (período 3), variação −2: altas (1·2 + 0)/3 = 2/3, baixas (1/3·2 + 2)/3 = 8/9
  const r = rsi(pts([10, 12, 11, 12, 10]), 3);
  const rs = 2 / 3 / (8 / 9);
  close(r[4], 100 - 100 / (1 + rs));
});

test("rsi: só altas = 100, só baixas = 0, parado = 100 (como no TradingView)", () => {
  assert.equal(rsi(pts([1, 2, 3, 4]), 3)[3], 100);
  assert.equal(rsi(pts([4, 3, 2, 1]), 3)[3], 0);
  assert.equal(rsi(pts([5, 5, 5, 5]), 3)[3], 100);
});

test("rsi: poucas velas ou período inválido", () => {
  assert.deepEqual(rsi(pts([1, 2, 3]), 3), [null, null, null]);
  assert.deepEqual(rsi([], 14), []);
  assert.deepEqual(rsi(null, 14), []);
  assert.deepEqual(rsi(pts([1, 2]), 0), [null, null]);
});
