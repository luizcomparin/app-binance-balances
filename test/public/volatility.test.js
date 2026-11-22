// Faixa estatística (public/components/price-chart/volatility.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { annualizedPct, dailyVolatility, priceBand, touchProbability } from "../../public/components/price-chart/volatility.js";

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `esperado ${b}, veio ${a}`);
const points = (closes) => closes.map((c, i) => ({ time: i, close: c }));

test("dailyVolatility: null com menos de 30 dias de retornos", () => {
  assert.equal(dailyVolatility(points(Array(30).fill(100))), null);
  assert.notEqual(dailyVolatility(points(Array(31).fill(100))), null);
});

test("dailyVolatility: crescimento constante tem volatilidade zero", () => {
  const v = dailyVolatility(points(Array.from({ length: 40 }, (_, i) => 100 * Math.exp(0.02 * i))));
  close(v.sigmaDaily, 0);
  assert.equal(v.days, 39);
  close(v.price, 100 * Math.exp(0.02 * 39));
});

test("dailyVolatility: desvio padrão amostral dos retornos log", () => {
  // retornos alternando +1% e −1% (em log): média ~0, desvio ≈ 1%
  const closes = Array.from({ length: 41 }, (_, i) => 100 * Math.exp(i % 2 ? 0.01 : 0));
  const v = dailyVolatility(points(closes));
  const n = 40;
  close(v.sigmaDaily, Math.sqrt((n * 0.0001) / (n - 1)), 1e-12);
});

test("dailyVolatility: usa só o último ano (365 retornos)", () => {
  assert.equal(dailyVolatility(points(Array(500).fill(100))).days, 365);
});

test("annualizedPct: σ diário × √365", () => {
  close(annualizedPct(0.01), Math.sqrt(365), 1e-12);
});

test("priceBand: lognormal simétrica em log", () => {
  const b = priceBand(100, 0.01, 4, 1);
  close(b.low, 100 * Math.exp(-0.02));
  close(b.high, 100 * Math.exp(0.02));
  const ampla = priceBand(100, 0.01, 4, 1.96);
  assert.ok(ampla.low < b.low && ampla.high > b.high);
});

test("touchProbability: princípio da reflexão", () => {
  const sigma = 0.02;
  const days = 9;
  // alvo a exatamente 1 desvio (σ·√dias) de distância: 2·(1 − Φ(1)) = 0,3173105
  close(touchProbability(100, 100 * Math.exp(sigma * 3), sigma, days), 0.3173105, 1e-6);
  assert.equal(touchProbability(100, 100, sigma, days), 1, "já está no alvo");
  close(touchProbability(100, 120, sigma, days), touchProbability(100, 100 / 1.2, sigma, days), 1e-12);
  assert.ok(touchProbability(100, 120, sigma, 30) > touchProbability(100, 120, sigma, 5), "mais tempo, mais chance");
  assert.equal(touchProbability(100, 120, 0, days), null, "sem volatilidade");
});
