// Modelo do mapa de liquidação estimado (sem rede: recebe as séries já buscadas, por isso é testável).
// Quem busca os dados e converte os preços é services/liquidationMap.js; a explicação do modelo está lá.
//
// Com liquidações REAIS da hora (Binance, via Coinalyze), o modelo usa esse dado de duas formas:
//   a. Na queda do open interest, a parte que foi liquidação não encolhe os outros níveis (já saíram no
//      passo 5); só o fechamento voluntário encolhe.
//   b. Calibração: compara o que o modelo diz que foi liquidado (níveis atingidos) com o que de fato foi,
//      por lado, e multiplica os níveis daquele lado pela razão. Também mede a correlação hora a hora.

const HOUR = 60 * 60 * 1000;

// alavancagem → fatia das posições novas (suposição do modelo)
export const LEVERAGE_TIERS = [
	{ leverage: 5, weight: 0.1 },
	{ leverage: 10, weight: 0.3 },
	{ leverage: 25, weight: 0.3 },
	{ leverage: 50, weight: 0.2 },
	{ leverage: 100, weight: 0.1 },
];
export const MAINTENANCE_MARGIN = 0.005;
export const BUCKET_PCT = 0.0025; // níveis agrupados em faixas de 0,25% do preço atual
// um trecho do mapa de calor é "quebrado" quando o valor do nível muda mais que isso
const SEGMENT_CHANGE = 0.25;
const MIN_SEGMENT_SHARE = 0.003; // trechos menores que 0,3% do maior não são enviados
// calibração: as primeiras horas ficam de fora (o modelo ainda não "conhece" as posições abertas antes
// da janela, então subestima o que é liquidado no começo)
export const CALIBRATION_WARMUP_HOURS = 72;
export const CALIBRATION_MIN_HOURS = 24; // menos horas comparáveis que isso: sem calibração
export const CALIBRATION_FACTOR_RANGE = [0.05, 20]; // fator por lado limitado a essa faixa

// valor mais recente com timestamp <= t (séries vêm ordenadas)
function lookup(series, field) {
	let i = 0;
	return (t, fallback) => {
		while (i + 1 < series.length && series[i + 1].timestamp <= t) i++;
		const row = series[i];
		return row && row.timestamp <= t ? Number(row[field]) : fallback;
	};
}

/** Correlação de Pearson entre duas listas do mesmo tamanho; null sem variação ou com menos de 2 pontos */
export function pearson(xs, ys) {
	const n = xs.length;
	if (n < 2) return null;
	const mx = xs.reduce((a, v) => a + v, 0) / n;
	const my = ys.reduce((a, v) => a + v, 0) / n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		sxy += (xs[i] - mx) * (ys[i] - my);
		sxx += (xs[i] - mx) ** 2;
		syy += (ys[i] - my) ** 2;
	}
	return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/**
 * Roda o modelo.
 * @param candles  velas de 1h do contrato: [{ time, high, low, close, typical, takerBuyShare }]
 * @param oi       /futures/data/openInterestHist (1h): [{ timestamp, sumOpenInterest }]
 * @param globalLS /futures/data/globalLongShortAccountRatio (1h): [{ timestamp, longAccount }]
 * @param topLS    /futures/data/topLongShortPositionRatio (1h): [{ timestamp, longAccount }]
 * @param real     liquidações reais por hora (US$): [{ t, long, short }] ou null (sem chave/sem dado)
 * @returns { price, bucket, levels, segments, ratios, calibration } com preços do CONTRATO
 */
export function runLiquidationModel({ candles, oi, globalLS = [], topLS = [], real = null }) {
	const candleAt = new Map(candles.map((c) => [c.time, c]));
	const lastPrice = candles.at(-1).close;
	const bucket = lastPrice * BUCKET_PCT;
	const toBucket = (p) => Math.round(p / bucket) * bucket;

	const globalLong = lookup(globalLS, "longAccount");
	const topLong = lookup(topLS, "longAccount");

	// liquidações reais por hora; dentro do período coberto, hora sem linha = 0 (a Coinalyze omite zeros)
	const realAt = new Map();
	let realFrom = Infinity;
	let realTo = -Infinity;
	for (const r of real || []) {
		realAt.set(r.t, { long: Number(r.long) || 0, short: Number(r.short) || 0 });
		realFrom = Math.min(realFrom, r.t);
		realTo = Math.max(realTo, r.t);
	}
	const realOf = (t) => (t >= realFrom && t <= realTo ? realAt.get(t) || { long: 0, short: 0 } : null);

	// níveis ativos: "L|preço" / "S|preço" → { side, price, usd, seg: { from, usd } }
	const active = new Map();
	const segments = [];
	const closeSegment = (lvl, to) => {
		if (lvl.seg.usd > 0) segments.push({ p: lvl.price, s: lvl.side, f: lvl.seg.from, t: to, u: lvl.seg.usd });
	};
	const splitIfChanged = (lvl, now) => {
		if (Math.abs(lvl.usd - lvl.seg.usd) > lvl.seg.usd * SEGMENT_CHANGE) {
			closeSegment(lvl, now);
			lvl.seg = { from: now, usd: lvl.usd };
		}
	};

	// comparação modelo × real, por hora (só depois do aquecimento e dentro do período com dado real)
	const firstHour = oi.length ? oi[0].timestamp : 0;
	const compared = []; // [{ model: { long, short }, real: { long, short } }]

	for (let i = 1; i < oi.length; i++) {
		const from = oi[i - 1].timestamp;
		const candle = candleAt.get(from);
		if (!candle) continue;
		const now = candle.time;
		const realHour = realOf(now);

		// 5. o preço desta hora passou pelos níveis → liquidados
		const modelHour = { long: 0, short: 0 };
		for (const [key, lvl] of active) {
			const hit = lvl.side === "L" ? candle.low <= lvl.price : candle.high >= lvl.price;
			if (!hit) continue;
			modelHour[lvl.side === "L" ? "long" : "short"] += lvl.usd;
			closeSegment(lvl, now);
			active.delete(key);
		}
		if (realHour && now - firstHour >= CALIBRATION_WARMUP_HOURS * HOUR) compared.push({ model: modelHour, real: realHour });

		const qtyBefore = Number(oi[i - 1].sumOpenInterest);
		const qtyAfter = Number(oi[i].sumOpenInterest);
		if (!qtyBefore || !qtyAfter) continue;

		if (qtyAfter < qtyBefore) {
			// 4. posições fechadas: reduz todas na mesma proporção. a. A parte da queda que foi liquidação
			// (já removida no passo 5) não conta: só o fechamento voluntário encolhe os outros níveis.
			const liquidatedQty = realHour ? (realHour.long + realHour.short) / candle.typical : 0;
			const f = Math.min(1, (qtyAfter + liquidatedQty) / qtyBefore);
			if (f >= 1) continue;
			for (const lvl of active.values()) {
				lvl.usd *= f;
				splitIfChanged(lvl, now + HOUR);
			}
			continue;
		}

		// 1-3. posições novas, divididas entre comprados e vendidos e por alavancagem
		const notional = (qtyAfter - qtyBefore) * candle.typical;
		const longShare = 0.4 * globalLong(now, 0.5) + 0.3 * topLong(now, 0.5) + 0.3 * candle.takerBuyShare;
		for (const side of ["L", "S"]) {
			const sideUsd = notional * 2 * (side === "L" ? longShare : 1 - longShare);
			for (const { leverage, weight } of LEVERAGE_TIERS) {
				const move = 1 / leverage - MAINTENANCE_MARGIN;
				const price = toBucket(candle.typical * (side === "L" ? 1 - move : 1 + move));
				const key = `${side}|${price}`;
				let lvl = active.get(key);
				if (!lvl) {
					lvl = { side, price, usd: 0, seg: { from: now + HOUR, usd: 0 } };
					active.set(key, lvl);
				}
				lvl.usd += sideUsd * weight;
				if (!lvl.seg.usd) lvl.seg.usd = lvl.usd;
				else splitIfChanged(lvl, now + HOUR);
			}
		}
	}

	// níveis que continuam pendentes: trecho aberto até agora
	for (const lvl of active.values()) closeSegment(lvl, null);

	// b. calibração por lado
	const calibration = calibrate(compared, real !== null);
	const factorOf = (side) => calibration.factor?.[side === "L" ? "long" : "short"] ?? 1;

	const maxU = Math.max(0, ...segments.map((s) => s.u));
	const levels = new Map();
	for (const lvl of active.values()) {
		const row = levels.get(lvl.price) || { price: lvl.price, long: 0, short: 0 };
		row[lvl.side === "L" ? "long" : "short"] += lvl.usd * factorOf(lvl.side);
		levels.set(lvl.price, row);
	}

	return {
		price: lastPrice,
		bucket,
		ratios: {
			globalLongAccount: globalLong(Infinity, null),
			topLongPosition: topLong(Infinity, null),
		},
		levels: [...levels.values()]
			.map((l) => ({ price: l.price, long: Math.round(l.long), short: Math.round(l.short) }))
			.sort((a, b) => a.price - b.price),
		// o corte dos trechos pequenos é feito antes da calibração (não depende do fator)
		segments: segments
			.filter((s) => s.u >= maxU * MIN_SEGMENT_SHARE)
			.map((s) => ({ p: s.p, s: s.s, f: s.f, t: s.t, u: Math.round(s.u * factorOf(s.s)) })),
		calibration,
	};
}

/**
 * Compara as horas: { available, hours, model: { long, short }, real: { long, short }, factor, correlation }.
 * Sem dado real: { available: false, reason: "no-data" }; poucas horas: reason "few-hours".
 * factor[lado] = real ÷ modelo (limitado a CALIBRATION_FACTOR_RANGE) ou null quando um dos dois é zero.
 */
export function calibrate(compared, hasReal = true) {
	if (!hasReal) return { available: false, reason: "no-data" };
	if (compared.length < CALIBRATION_MIN_HOURS) return { available: false, reason: "few-hours", hours: compared.length };
	const sum = (list, k) => list.reduce((a, v) => a + v[k], 0);
	const model = { long: sum(compared.map((c) => c.model), "long"), short: sum(compared.map((c) => c.model), "short") };
	const real = { long: sum(compared.map((c) => c.real), "long"), short: sum(compared.map((c) => c.real), "short") };
	const ratio = (side) => (model[side] > 0 && real[side] > 0 ? Math.round(clamp(real[side] / model[side], CALIBRATION_FACTOR_RANGE) * 1000) / 1000 : null);
	const correlation = pearson(
		compared.map((c) => c.model.long + c.model.short),
		compared.map((c) => c.real.long + c.real.short)
	);
	return {
		available: true,
		hours: compared.length,
		model: { long: Math.round(model.long), short: Math.round(model.short) },
		real: { long: Math.round(real.long), short: Math.round(real.short) },
		factor: { long: ratio("long"), short: ratio("short") },
		correlation: correlation === null ? null : Math.round(correlation * 100) / 100,
	};
}
