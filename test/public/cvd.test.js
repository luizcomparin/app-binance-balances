// Delta de volume e CVD (public/components/price-chart/chart/cvd.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { volumeDelta } from "../../public/components/price-chart/chart/cvd.js";

test("volumeDelta: delta = compras − vendas e CVD acumulado", () => {
  const { delta, cvd } = volumeDelta([
    { volume: 100, buyVolume: 70 }, // +40
    { volume: 50, buyVolume: 10 }, // −30
    { volume: 20, buyVolume: 10 }, // 0
  ]);
  assert.deepEqual(delta, [40, -30, 0]);
  assert.deepEqual(cvd, [40, 10, 10]);
});

test("volumeDelta: vela sem buyVolume não tem delta e o CVD repete o anterior", () => {
  const { delta, cvd } = volumeDelta([{ volume: 10 }, { volume: 10, buyVolume: 8 }, { volume: 5 }, { volume: 4, buyVolume: 0 }]);
  assert.deepEqual(delta, [null, 6, null, -4]);
  assert.deepEqual(cvd, [null, 6, 6, 2]);
});

test("volumeDelta: sem velas", () => {
  assert.deepEqual(volumeDelta([]), { delta: [], cvd: [] });
  assert.deepEqual(volumeDelta(null), { delta: [], cvd: [] });
});
