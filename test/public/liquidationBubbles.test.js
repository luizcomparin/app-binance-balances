// Bolhas das liquidações reais no gráfico (public/components/price-chart/chart/liquidationBubbles.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { bubbleRadius, bubbleScale, bubblesAbove, liquidationBubbles, parseUsdAmount } from "../../public/components/price-chart/chart/liquidationBubbles.js";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);
const points = [0, 1, 2].map((i) => ({ time: T0 + i * DAY, high: 110 + i, low: 90 + i }));
const row = (t, binance, bybit) => ({
  t,
  long: binance.long + bybit.long,
  short: binance.short + bybit.short,
  by: { Binance: binance, Bybit: bybit },
});

test("longs na mínima e shorts na máxima; vela sem liquidação não gera bolha", () => {
  const rows = [row(T0, { long: 10, short: 0 }, { long: 5, short: 3 })];
  assert.deepEqual(liquidationBubbles(points, rows), [
    { index: 0, side: "long", price: 90, usd: 15 },
    { index: 0, side: "short", price: 110, usd: 3 },
  ]);
});

test("soma as linhas que caem na mesma vela (vela diária com dados por hora)", () => {
  const rows = [row(T0 + DAY, { long: 1, short: 0 }, { long: 0, short: 0 }), row(T0 + DAY + 3600e3, { long: 2, short: 0 }, { long: 0, short: 0 })];
  assert.deepEqual(liquidationBubbles(points, rows), [{ index: 1, side: "long", price: 91, usd: 3 }]);
});

test("só Binance usa by.Binance; linha sem Binance é ignorada", () => {
  const rows = [row(T0, { long: 10, short: 0 }, { long: 5, short: 3 }), { t: T0 + 2 * DAY, long: 7, short: 0, by: { OKX: { long: 7, short: 0 } } }];
  assert.deepEqual(liquidationBubbles(points, rows, "binance"), [{ index: 0, side: "long", price: 90, usd: 10 }]);
});

test("linhas antes da primeira vela ficam de fora; sem dados → lista vazia", () => {
  assert.deepEqual(liquidationBubbles(points, [row(T0 - DAY, { long: 1, short: 1 }, { long: 0, short: 0 })]), []);
  assert.deepEqual(liquidationBubbles(points, []), []);
  assert.deepEqual(liquidationBubbles([], [row(T0, { long: 1, short: 1 }, { long: 0, short: 0 })]), []);
});

test("escala pelo percentil 98 e raio proporcional à raiz do valor", () => {
  const bubbles = Array.from({ length: 100 }, (_, i) => ({ usd: i + 1 }));
  assert.equal(bubbleScale(bubbles), 99);
  assert.equal(bubbleScale([]), 1);
  const big = bubbleRadius(100, 100);
  const quarter = bubbleRadius(25, 100);
  assert.ok(big > quarter);
  assert.equal(bubbleRadius(1000, 100), big); // acima da escala fica no máximo
  assert.equal(bubbleRadius(1, 100), null); // pequena demais
});

test("parseUsdAmount: sufixos K/M/B (e mil/mi/bi), vírgula decimal, vazio = 0, inválido = null", () => {
  assert.equal(parseUsdAmount("5M"), 5e6);
  assert.equal(parseUsdAmount("1,5 mi"), 1.5e6);
  assert.equal(parseUsdAmount("500k"), 5e5);
  assert.equal(parseUsdAmount("2B"), 2e9);
  assert.equal(parseUsdAmount("US$ 300000"), 300000);
  assert.equal(parseUsdAmount(" "), 0);
  assert.equal(parseUsdAmount("abc"), null);
  assert.equal(parseUsdAmount("-5M"), null);
});

test("bubblesAbove: esconde as menores que o limite, mas a escala continua a de todas", () => {
  const bubbles = Array.from({ length: 100 }, (_, i) => ({ usd: i + 1 }));
  const all = bubblesAbove(bubbles);
  const big = bubblesAbove(bubbles, 90);
  assert.equal(all.list.length, 100);
  assert.equal(big.list.length, 11);
  assert.ok(big.list.every((b) => b.usd >= 90));
  assert.equal(big.scale, all.scale);
  assert.deepEqual(bubblesAbove(null, 5), { list: [], scale: 1 });
});
