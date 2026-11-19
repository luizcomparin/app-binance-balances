// Utilitários de cache e concorrência.

// ---- Cache curto: evita repetir chamadas iguais em recargas seguidas ----
export const SHORT_CACHE_MS = 15 * 1000;
const shortCache = new Map(); // key -> { promise, settledAt }

// Chamadas simultâneas com a mesma chave compartilham a mesma promise;
// o resultado vale por `ttlMs`; erros não ficam em cache.
export function cached(key, ttlMs, fn) {
	const hit = shortCache.get(key);
	if (hit && (hit.settledAt === null || Date.now() - hit.settledAt < ttlMs)) {
		return hit.promise;
	}

	const entry = { promise: null, settledAt: null };
	entry.promise = fn().then(
		(value) => {
			entry.settledAt = Date.now();
			return value;
		},
		(err) => {
			shortCache.delete(key);
			throw err;
		}
	);
	shortCache.set(key, entry);
	return entry.promise;
}

// Executa `fn` sobre `items` com no máximo `limit` chamadas simultâneas
export async function mapLimit(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const idx = next++;
			results[idx] = await fn(items[idx], idx);
		}
	});
	await Promise.all(workers);
	return results;
}
