// Período × tamanho de vela (public/components/price-chart/timeframe.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { clampWindow, DAY, fitInterval, INTERVAL_MS, MAX_CANDLES, rangeDays, rangeWindow, recommendedInterval } from "../../public/components/price-chart/timeframe.js";

test("rangeDays: presets, personalizado e padrão", () => {
  assert.equal(rangeDays("7d"), 7);
  assert.equal(rangeDays("6m"), 182);
  assert.equal(rangeDays("2y"), 730);
  assert.equal(rangeDays("all"), Infinity);
  assert.equal(rangeDays("3m"), 90, "mês = 30 dias");
  assert.equal(rangeDays("2y"), 730);
  assert.equal(rangeDays("10d"), 10);
  assert.equal(rangeDays("lixo"), 30, "valor inválido cai em 30 dias");
});

test("recommendedInterval: a menor vela com até ~500 velas na tela", () => {
  assert.equal(recommendedInterval(7), "1h", "168 velas de 1h");
  assert.equal(recommendedInterval(30), "4h", "720 de 1h é demais; 180 de 4h");
  assert.equal(recommendedInterval(365), "1d");
  assert.equal(recommendedInterval(730), "1w", "730 diárias é demais");
  assert.equal(recommendedInterval(Infinity), "1w");
});

test("fitInterval: sobe a vela enquanto a janela pedir mais que MAX_CANDLES", () => {
  assert.equal(MAX_CANDLES, 3000);
  const days200 = Date.now() - 200 * DAY;
  assert.equal(fitInterval("1h", days200), "4h", "4800 velas de 1h → 1200 de 4h");
  assert.equal(fitInterval("1d", days200), "1d", "vela que já cabe não muda");
  assert.equal(fitInterval("1d", 0), "1w", "'Tudo' (desde 2017) em diário passa de 3000");
});

test("rangeWindow: termina agora; 'all' começa em 0", () => {
  assert.deepEqual(rangeWindow("all"), { fromMs: 0, toMs: null });
  const w = rangeWindow("7d");
  assert.equal(w.toMs, null);
  assert.ok(Math.abs(w.fromMs - (Date.now() - 7 * DAY)) < 1000);
});

test("clampWindow: encurta o início para caber em MAX_CANDLES da vela escolhida", () => {
  const w = clampWindow({ fromMs: 0, toMs: null }, "1h");
  assert.ok(Math.abs(w.fromMs - (Date.now() - MAX_CANDLES * INTERVAL_MS["1h"])) < 1000);
  const end = Date.UTC(2026, 0, 1);
  const curta = clampWindow({ fromMs: end - 10 * DAY, toMs: end }, "1d");
  assert.equal(curta.fromMs, end - 10 * DAY, "janela que já cabe não muda");
});
