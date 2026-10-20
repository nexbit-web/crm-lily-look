/** Рядок дерева категорій: досить знати себе й батька. */
type TreeRow = { id: string; parentId: string | null };

/**
 * Новий порядок ряду сусідів: `from` стає перед `to` (або після, якщо
 * `after`). Решта зсувається. Невідомий `to` — порядок без змін.
 */
export function moveWithin(ids: string[], from: string, to: string, after: boolean): string[] {
	if (from === to) return ids;
	const rest = ids.filter((id) => id !== from);
	const at = rest.indexOf(to);
	if (at === -1) return ids;
	rest.splice(after ? at + 1 : at, 0, from);
	return rest;
}

/**
 * Плаский список дерева, де ряд дітей `parentId` стоїть у порядку `ids`.
 * Підкатегорії їдуть разом зі своєю категорією — дерево не розсипається.
 */
export function withSiblingOrder<T extends TreeRow>(
	rows: T[],
	parentId: string | null,
	ids: string[]
): T[] {
	const rank = new Map(ids.map((id, index) => [id, index]));
	const out: T[] = [];

	const walk = (parent: string | null, depth: number) => {
		// Обмеження на випадок зіпсованого дерева — краще зупинитись, ніж зависнути.
		if (depth > 20) return;
		let children = rows.filter((row) => row.parentId === parent);
		if (parent === parentId) {
			children = [...children].sort(
				(a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
			);
		}
		for (const child of children) {
			out.push(child);
			walk(child.id, depth + 1);
		}
	};

	walk(null, 0);
	return out;
}

/** Місце кожного рядка серед своїх сусідів: 0, 1, 2… у порядку списку. */
export function siblingIndex(rows: TreeRow[]): Map<string, number> {
	const index = new Map<string, number>();
	const count = new Map<string | null, number>();
	for (const row of rows) {
		const at = count.get(row.parentId) ?? 0;
		index.set(row.id, at);
		count.set(row.parentId, at + 1);
	}
	return index;
}
