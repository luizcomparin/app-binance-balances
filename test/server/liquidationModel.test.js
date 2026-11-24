// Mapa de liquidação estimado: modelo e calibração com liquidações reais (server/services/liquidationModel.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
	calibrate,
	CALIBRATION_MIN_HOURS,
	CALIBRATION_WARMUP_HOURS,
	FIT_MIN_HOURS,
	fitLeverageTiers,
	LEVERAGE_TIERS,
	pearson,
	runLiquidationModel,
	simulate,
	tierScore,
	weightGrid,
} from "../../server/services/liquidationModel.js";

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

// velas de 1h com preço fixo (sem atingir nenhum nível), exceto as indicadas em `moves` (índice → { high, low })
function series(hours, { price = 100, moves = {}, oiAt = () => 1000 } = {}) {
	const candles = [];
	const oi = [];
	for (let i = 0; i <= hours; i++) {
		const m = moves[i] || {};
		const high = m.high ?? price;
		const low = m.low ?? price;
		candles.push({ time: T0 + i * HOUR, high, low, close: price, typical: price, takerBuyShare: 0.5 });
		oi.push({ timestamp: T0 + i * HOUR, sumOpenInterest: String(oiAt(i)) });
	}
	return { candles, oi };
}

const total = (levels, side) => levels.reduce((a, l) => a + l[side], 0);

test("pearson: correlação perfeita, inversa e sem variação", () => {
	assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
	assert.equal(pearson([1, 2, 3], [3, 2, 1]), -1);
	assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
	assert.equal(pearson([1], [1]), null);
});

test("OI subiu: notional novo vira níveis long abaixo e short acima, metade para cada lado", () => {
	// hora 0→1: OI 1000 → 1100 a preço 100 = 10.000 US$ novos (× 2 lados)
	const { candles, oi } = series(2, { oiAt: (i) => (i === 0 ? 1000 : 1100) });
	const r = runLiquidationModel({ candles, oi });
	assert.ok(Math.abs(total(r.levels, "long") - 10000) <= 5);
	assert.ok(Math.abs(total(r.levels, "short") - 10000) <= 5);
	assert.ok(r.levels.filter((l) => l.long).every((l) => l.price < 100));
	assert.ok(r.levels.filter((l) => l.short).every((l) => l.price > 100));
	assert.deepEqual(r.calibration, { available: false, reason: "no-data" });
});

test("OI caiu sem dado real: encolhe todos os níveis na proporção", () => {
	// 1000 → 1100 (abre) e 1100 → 990 (fecha 10%)
	const { candles, oi } = series(3, { oiAt: (i) => [1000, 1100, 990, 990][i] });
	const r = runLiquidationModel({ candles, oi });
	assert.ok(Math.abs(total(r.levels, "long") - 9000) <= 5);
});

test("OI caiu com liquidações reais: a parte liquidada não encolhe os outros níveis", () => {
	const { candles, oi } = series(3, { oiAt: (i) => [1000, 1100, 990, 990][i] });
	// a queda (OI 1100 → 990) acontece na vela da hora 1: 110 contratos × 100 = 11.000 US$; 5.500 foram liquidações reais → só metade encolhe
	const real = [{ t: T0 + HOUR, long: 5500, short: 0 }];
	const r = runLiquidationModel({ candles, oi, real });
	assert.ok(Math.abs(total(r.levels, "long") - 10000 * (1 - 0.05)) <= 5);
	// queda toda explicada por liquidações → nada encolhe
	const all = runLiquidationModel({ candles, oi, real: [{ t: T0 + HOUR, long: 11000, short: 0 }] });
	assert.ok(Math.abs(total(all.levels, "long") - 10000) <= 5);
});

test("preço atravessa o nível: os longs daquele nível somem", () => {
	// abre na hora 0; na hora 2 a mínima vai a 50 (atinge todos os longs, de 5x a 100x)
	const { candles, oi } = series(3, { oiAt: (i) => (i === 0 ? 1000 : 1100), moves: { 2: { low: 50 } } });
	const r = runLiquidationModel({ candles, oi });
	assert.equal(total(r.levels, "long"), 0);
	assert.ok(total(r.levels, "short") > 0);
});

test("calibração: poucas horas comparáveis → indisponível", () => {
	const c = calibrate([{ model: { long: 1, short: 1 }, real: { long: 1, short: 1 } }]);
	assert.equal(c.available, false);
	assert.equal(c.reason, "few-hours");
});

test("calibração: fator = real ÷ modelo por lado, limitado; null quando o modelo é zero", () => {
	const hours = Array.from({ length: CALIBRATION_MIN_HOURS }, (_, i) => ({
		model: { long: i % 2 ? 100 : 0, short: 0 },
		real: { long: i % 2 ? 50 : 0, short: 10 },
	}));
	const c = calibrate(hours);
	assert.equal(c.available, true);
	assert.equal(c.factor.long, 0.5);
	assert.equal(c.factor.short, null);
	assert.equal(c.hours, CALIBRATION_MIN_HOURS);
	// fator gigante é limitado
	const big = calibrate(hours.map((h) => ({ ...h, real: { long: h.model.long * 1000, short: 0 } })));
	assert.equal(big.factor.long, 20);
});

test("modelo com dado real: horas do aquecimento ficam fora; fator multiplica os níveis do lado", () => {
	const hours = CALIBRATION_WARMUP_HOURS + 60;
	// abre posições toda hora e, de 10 em 10 horas, a mínima atinge os longs de 100x (−0,5%)
	const moves = {};
	for (let i = 2; i <= hours; i += 10) moves[i] = { low: 99.4 };
	const { candles, oi } = series(hours, { oiAt: (i) => 1000 + i * 10, moves });
	const base = runLiquidationModel({ candles, oi });
	// real = o dobro do modelo nas horas em que houve liquidação; usa os valores que o próprio modelo calcula
	const realRows = [];
	for (let i = 0; i <= hours; i++) realRows.push({ t: T0 + i * HOUR, long: 0, short: 0 });
	const probe = runLiquidationModel({ candles, oi, real: realRows });
	assert.equal(probe.calibration.available, true);
	assert.equal(probe.calibration.hours, hours - CALIBRATION_WARMUP_HOURS);
	assert.equal(probe.calibration.factor.long, null); // real zerado: sem fator, níveis iguais ao modelo
	assert.deepEqual(probe.levels, base.levels);

	const modelLong = probe.calibration.model.long;
	assert.ok(modelLong > 0);
	// real espalhado nas horas comparadas, somando 2× o modelo
	const compared = [];
	for (let i = CALIBRATION_WARMUP_HOURS; i < hours; i++) compared.push(i); // velas comparadas
	const each = (2 * modelLong) / compared.length;
	const real2 = compared.map((i) => ({ t: T0 + i * HOUR, long: each, short: 0 }));
	const cal = runLiquidationModel({ candles, oi, real: real2 });
	assert.ok(Math.abs(cal.calibration.factor.long - 2) < 0.05);
	assert.ok(Math.abs(total(cal.levels, "long") / total(base.levels, "long") - cal.calibration.factor.long) < 0.05);
	assert.deepEqual(
		cal.levels.map((l) => l.short),
		base.levels.map((l) => l.short)
	);
});

// ---- ajuste da divisão por alavancagem ----

// gerador determinístico (os testes não podem variar entre execuções)
function rng(seed) {
	let s = seed;
	return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

// horas comparadas por faixa: liquidações esparsas e independentes em cada alavancagem;
// realOf(models do instante) diz quanto foi liquidado de verdade
function perTierData(hours, realOf, seed = 7) {
	const rand = rng(seed);
	const models = Array.from({ length: hours }, () =>
		LEVERAGE_TIERS.map(() => ({ long: rand() < 0.2 ? rand() * 1000 : 0, short: rand() < 0.2 ? rand() * 1000 : 0 }))
	);
	return LEVERAGE_TIERS.map((_, k) => models.map((m) => ({ model: m[k], real: realOf(m) })));
}

test("weightGrid: 1001 divisões de 10 em 10%, todas somando 1, incluindo a padrão", () => {
	const grid = weightGrid(5);
	assert.equal(grid.length, 1001);
	assert.ok(grid.every((w) => Math.abs(w.reduce((a, v) => a + v, 0) - 1) < 1e-9));
	assert.ok(grid.some((w) => w.every((v, k) => Math.abs(v - LEVERAGE_TIERS[k].weight) < 1e-9)));
});

test("tierScore: correlação 1 quando o real é exatamente a combinação pedida", () => {
	const data = perTierData(50, (m) => ({ long: m[2].long * 0.3, short: m[2].short * 0.3 }));
	assert.ok(Math.abs(tierScore(data, [0, 0, 1, 0, 0]) - 1) < 1e-9);
	assert.ok(tierScore(data, [1, 0, 0, 0, 0]) < 0.5);
});

test("fitLeverageTiers: real vem só dos 5x → adota 100% em 5x (passa na validação)", () => {
	const data = perTierData(FIT_MIN_HOURS + 60, (m) => ({ long: m[0].long * 0.2, short: m[0].short * 0.2 }));
	const fit = fitLeverageTiers(data);
	assert.equal(fit.fitted, true);
	assert.deepEqual(
		fit.tiers.map((t) => t.weight),
		[1, 0, 0, 0, 0]
	);
	assert.deepEqual(
		fit.tiers.map((t) => t.leverage),
		LEVERAGE_TIERS.map((t) => t.leverage)
	);
	assert.ok(fit.validation.fitted > fit.validation.default);
});

test("fitLeverageTiers: real igual à divisão padrão → mantém a padrão (sem ganho)", () => {
	const data = perTierData(FIT_MIN_HOURS + 60, (m) => ({
		long: m.reduce((a, v, k) => a + v.long * LEVERAGE_TIERS[k].weight, 0),
		short: m.reduce((a, v, k) => a + v.short * LEVERAGE_TIERS[k].weight, 0),
	}));
	const fit = fitLeverageTiers(data);
	assert.equal(fit.fitted, false);
	assert.equal(fit.reason, "no-gain");
	assert.equal(fit.tiers, LEVERAGE_TIERS);
});

test("fitLeverageTiers: poucas horas → padrão; runLiquidationModel sem real não ajusta", () => {
	const data = perTierData(FIT_MIN_HOURS - 1, (m) => m[0]);
	assert.equal(fitLeverageTiers(data).reason, "few-hours");
	const { candles, oi } = series(3, { oiAt: (i) => (i === 0 ? 1000 : 1100) });
	const r = runLiquidationModel({ candles, oi });
	assert.equal(r.leverage.fitted, false);
	assert.equal(r.leverage.tiers, LEVERAGE_TIERS);
});

test("o modelo é linear nos pesos: soma das simulações de uma alavancagem = simulação com a divisão", () => {
	// OI sobe e desce, preço oscila e há liquidações reais (encolhimento parcial)
	const rand = rng(3);
	const hours = 200;
	const moves = {};
	for (let i = 1; i <= hours; i++) moves[i] = { high: 100 + rand() * 4, low: 100 - rand() * 4 };
	const { candles, oi } = series(hours, { moves, oiAt: (i) => 1000 + Math.round(200 * Math.sin(i / 7)) + i });
	const real = candles.map((c, i) => ({ t: c.time, long: i % 5 ? 0 : 300, short: i % 7 ? 0 : 200 }));
	const input = { candles, oi, real };
	const full = simulate(input, LEVERAGE_TIERS).compared;
	const parts = LEVERAGE_TIERS.map(({ leverage }) => simulate(input, [{ leverage, weight: 1 }]).compared);
	assert.ok(full.length > 0);
	for (let h = 0; h < full.length; h++) {
		for (const side of ["long", "short"]) {
			const sum = parts.reduce((a, p, k) => a + p[h].model[side] * LEVERAGE_TIERS[k].weight, 0);
			assert.ok(Math.abs(sum - full[h].model[side]) < 1e-6 * Math.max(1, sum), `hora ${h} ${side}`);
		}
	}
});
