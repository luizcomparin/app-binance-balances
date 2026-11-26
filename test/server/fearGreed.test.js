// Fear & Greed Index: leitura da resposta da Alternative.me (server/services/fearGreed.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFearGreed } from "../../server/services/fearGreed.js";

test("parseFearGreed: converte, ordena por tempo e traduz a classificação", () => {
	const raw = {
		name: "Fear and Greed Index",
		data: [
			{ value: "11", value_classification: "Extreme Fear", timestamp: "1795651200", time_until_update: "81668" },
			{ value: "55", value_classification: "Greed", timestamp: "1795564800" },
			{ value: "50", value_classification: "Neutral", timestamp: "1795478400" },
		],
		metadata: { error: null },
	};
	assert.deepEqual(parseFearGreed(raw), [
		{ t: 1795478400000, v: 50, c: "neutral" },
		{ t: 1795564800000, v: 55, c: "greed" },
		{ t: 1795651200000, v: 11, c: "extreme-fear" },
	]);
});

test("parseFearGreed: descarta linhas inválidas e dias repetidos; classificação desconhecida vira null", () => {
	const raw = {
		data: [
			{ value: "30", value_classification: "Fear", timestamp: "200" },
			{ value: "99", value_classification: "Extreme Greed", timestamp: "200" }, // dia repetido: vale o primeiro
			{ value: "abc", value_classification: "Fear", timestamp: "300" },
			{ value: "", value_classification: "Fear", timestamp: "350" },
			{ value: "120", value_classification: "Fear", timestamp: "400" },
			{ value: "-1", value_classification: "Fear", timestamp: "450" },
			{ value: "40", value_classification: "Fear", timestamp: "" },
			{ value: "40", value_classification: "Fear" },
			null,
			{ value: "0", value_classification: "Algo novo", timestamp: "100" },
		],
	};
	assert.deepEqual(parseFearGreed(raw), [
		{ t: 100000, v: 0, c: null },
		{ t: 200000, v: 30, c: "fear" },
	]);
});

test("parseFearGreed: resposta vazia ou sem data", () => {
	assert.deepEqual(parseFearGreed(null), []);
	assert.deepEqual(parseFearGreed({}), []);
	assert.deepEqual(parseFearGreed({ data: [] }), []);
});
