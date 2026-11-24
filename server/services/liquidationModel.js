// Modelo do mapa de liquidação estimado (sem rede: recebe as séries já buscadas, por isso é testável).
// Quem busca os dados e converte os preços é services/liquidationMap.js; a explicação do modelo está lá.
//
// Com liquidações REAIS da hora (Binance, via Coinalyze), o modelo usa esse dado de duas formas:
//   a. Na queda do open interest, a parte que foi liquidação não encolhe os outros níveis (já saíram no
//      passo 5); só o fechamento voluntário encolhe.
//   b. Calibração: compara o que o modelo diz que foi liquidado (níveis atingidos) com o que de fato foi,
//      por lado, e multiplica os níveis daquele lado pela razão. Também mede a correlação hora a hora.
//   c. Ajuste da alavancagem: escolhe a divisão entre 5x/10x/25x/50x/100x que melhor acompanha as
//      liquidações reais (fitLeverageTiers), validada num trecho que não entrou no ajuste.

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
// ajuste da alavancagem: pesos em passos de 10% (1001 divisões); os primeiros 2/3 das horas comparáveis
// escolhem a divisão e o último 1/3 confirma. Só é adotada se acertar mais que a padrão fora da amostra.
export const FIT_STEPS = 10;
export const FIT_MIN_HOURS = 168; // 7 dias comparáveis
export const FIT_TRAIN_SHARE = 2 / 3;
export const FIT_MIN_GAIN = 0.02; // ganho mínimo de correlação (fora da amostra) para trocar a padrão

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
 * Roda o modelo (com liquidações reais, ajusta antes a divisão por alavancagem).
 * @param candles  velas de 1h do contrato: [{ time, high, low, close, typical, takerBuyShare }]
 * @param oi       /futures/data/openInterestHist (1h): [{ timestamp, sumOpenInterest }]
 * @param globalLS /futures/data/globalLongShortAccountRatio (1h): [{ timestamp, longAccount }]
 * @param topLS    /futures/data/topLongShortPositionRatio (1h): [{ timestamp, longAccount }]
 * @param real     liquidações reais por hora (US$): [{ t, long, short }] ou null (sem chave/sem dado)
 * @returns { price, bucket, levels, segments, ratios, calibration, leverage } com preços do CONTRATO
 */
export function runLiquidationModel(input) {
	let leverage = { fitted: false, reason: "no-data", tiers: LEVERAGE_TIERS };
	if (input.real) {
		// o modelo é linear nos pesos (atingir ou encolher um nível não depende do peso): uma simulação por
		// alavancagem, com peso 1, dá a contribuição de cada uma às liquidações de cada hora
		const perTier = LEVERAGE_TIERS.map(({ leverage: lev }) => simulate(input, [{ leverage: lev, weight: 1 }]).compared);
		leverage = fitLeverageTiers(perTier);
	}
	const sim = simulate(input, leverage.tiers);

	// b. calibração por lado
	const calibration = calibrate(sim.compared, input.real != null);
	const factorOf = (side) => calibration.factor?.[side === "L" ? "long" : "short"] ?? 1;

	const maxU = Math.max(0, ...sim.segments.map((s) => s.u));
	const levels = new Map();
	for (const lvl of sim.active.values()) {
		const row = levels.get(lvl.price) || { price: lvl.price, long: 0, short: 0 };
		row[lvl.side === "L" ? "long" : "short"] += lvl.usd * factorOf(lvl.side);
		levels.set(lvl.price, row);
	}

	return {
		price: sim.lastPrice,
		bucket: sim.bucket,
		ratios: sim.ratios,
		levels: [...levels.values()]
			.map((l) => ({ price: l.price, long: Math.round(l.long), short: Math.round(l.short) }))
			.sort((a, b) => a.price - b.price),
		// o corte dos trechos pequenos é feito antes da calibração (não depende do fator)
		segments: sim.segments
			.filter((s) => s.u >= maxU * MIN_SEGMENT_SHARE)
			.map((s) => ({ p: s.p, s: s.s, f: s.f, t: s.t, u: Math.round(s.u * factorOf(s.s)) })),
		calibration,
		leverage,
	};
}

// Simulação hora a hora com a divisão por alavancagem "tiers":
// { active, segments, compared: [{ model: { long, short }, real: { long, short } }], lastPrice, bucket, ratios }
export function simulate({ candles, oi, globalLS = [], topLS = [], real = null }, tiers) {
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
			for (const { leverage, weight } of tiers) {
				if (!weight) continue;
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

	return {
		active,
		segments,
		compared,
		lastPrice,
		bucket,
		ratios: { globalLongAccount: globalLong(Infinity, null), topLongPosition: topLong(Infinity, null) },
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
	const factor = { long: ratio("long"), short: ratio("short") };
	// correlação hora a hora do liquidado pelo modelo JÁ calibrado (lado sem fator: ×1) com o real
	const correlation = pearson(
		compared.map((c) => c.model.long * (factor.long ?? 1) + c.model.short * (factor.short ?? 1)),
		compared.map((c) => c.real.long + c.real.short)
	);
	return {
		available: true,
		hours: compared.length,
		model: { long: Math.round(model.long), short: Math.round(model.short) },
		real: { long: Math.round(real.long), short: Math.round(real.short) },
		factor,
		correlation: correlation === null ? null : Math.round(correlation * 100) / 100,
	};
}

/** Todas as divisões de 1 em "parts" faixas com passo 1/steps: [[0.1, 0.3, ...], ...] */
export function weightGrid(parts, steps = FIT_STEPS) {
	const out = [];
	const walk = (left, acc) => {
		if (acc.length === parts - 1) return out.push([...acc, left].map((n) => n / steps));
		for (let n = 0; n <= left; n++) walk(left - n, [...acc, n]);
	};
	walk(steps, []);
	return out;
}

/**
 * Acerto de uma divisão nas horas [from, to): correlação hora a hora entre o liquidado pelo modelo
 * (com o fator real ÷ modelo de cada lado, como na calibração) e o real; null se não der para medir.
 * perTier[k][h] = { model: { long, short }, real: { long, short } } da simulação só com a alavancagem k.
 */
export function tierScore(perTier, weights, from = 0, to = perTier[0]?.length ?? 0) {
	const n = to - from;
	if (n < 2) return null;
	const mL = new Array(n).fill(0);
	const mS = new Array(n).fill(0);
	const real = new Array(n);
	let sumML = 0;
	let sumMS = 0;
	let sumRL = 0;
	let sumRS = 0;
	for (let h = 0; h < n; h++) {
		const r = perTier[0][from + h].real;
		real[h] = r.long + r.short;
		sumRL += r.long;
		sumRS += r.short;
		for (let k = 0; k < perTier.length; k++) {
			if (!weights[k]) continue;
			const m = perTier[k][from + h].model;
			mL[h] += weights[k] * m.long;
			mS[h] += weights[k] * m.short;
		}
		sumML += mL[h];
		sumMS += mS[h];
	}
	const fL = sumML > 0 ? sumRL / sumML : 1;
	const fS = sumMS > 0 ? sumRS / sumMS : 1;
	return pearson(
		mL.map((v, h) => v * fL + mS[h] * fS),
		real
	);
}

/**
 * Escolhe a divisão por alavancagem que melhor acompanha as liquidações reais.
 * perTier: uma lista de horas comparadas por faixa de defaultTiers (mesma ordem e mesmas horas).
 * Retorna { fitted, tiers, defaultTiers, hours, correlation: { default, fitted }, validation: { hours, default, fitted } }.
 * Sem horas suficientes: { fitted: false, reason: "few-hours", tiers: defaultTiers };
 * sem ganho fora da amostra: { fitted: false, reason: "no-gain", tiers: defaultTiers, ... }.
 */
export function fitLeverageTiers(perTier, defaultTiers = LEVERAGE_TIERS) {
	const hours = perTier[0]?.length ?? 0;
	if (hours < FIT_MIN_HOURS) return { fitted: false, reason: "few-hours", tiers: defaultTiers, defaultTiers, hours };
	const defaultWeights = defaultTiers.map((t) => t.weight);
	const grid = weightGrid(defaultTiers.length);
	const best = (from, to) => {
		let top = null;
		for (const w of grid) {
			const score = tierScore(perTier, w, from, to);
			if (score !== null && (top === null || score > top.score)) top = { w, score };
		}
		return top;
	};
	const round = (v) => (v === null ? null : Math.round(v * 100) / 100);
	const split = Math.floor(hours * FIT_TRAIN_SHARE);
	const trained = best(0, split);
	const validation = {
		hours: hours - split,
		default: round(tierScore(perTier, defaultWeights, split, hours)),
		fitted: trained ? round(tierScore(perTier, trained.w, split, hours)) : null,
	};
	const all = best(0, hours);
	const correlation = { default: round(tierScore(perTier, defaultWeights)), fitted: all ? round(all.score) : null };
	const base = { defaultTiers, hours, correlation, validation };
	const gain = validation.fitted !== null && validation.fitted >= (validation.default ?? -1) + FIT_MIN_GAIN;
	if (!gain || !all) return { fitted: false, reason: "no-gain", tiers: defaultTiers, ...base };
	// passou na validação: a divisão final usa todas as horas
	return { fitted: true, tiers: defaultTiers.map((t, k) => ({ leverage: t.leverage, weight: all.w[k] })), ...base };
}
