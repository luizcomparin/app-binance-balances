export function toggleSort(sortState, key) {
	if (!sortState) return { key, asc: false };

	if (sortState.key === key) {
		sortState.asc = !sortState.asc;
	} else {
		sortState.key = key;
		sortState.asc = false;
	}

	return sortState;
}

export function compareValues(a, b, asc = true) {
	if (a < b) return asc ? -1 : 1;
	if (a > b) return asc ? 1 : -1;
	return 0;
}
