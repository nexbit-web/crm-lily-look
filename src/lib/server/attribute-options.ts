import { prisma } from './db';
import { DEFAULT_ATTRIBUTE_NAMES, type AttributeOption } from '$lib/product-attributes';

/** Скільки варіантів значення показувати в підказці одної характеристики. */
const MAX_VALUES = 20;

/**
 * Підказки для блоку характеристик, зібрані з наявних товарів.
 *
 * Та сама ідея, що й у variantOptions(): «Посадка» має лишатись однією
 * характеристикою з чотирма значеннями, а не розповзтись на «посадку»,
 * «Посадку» й «Fit». Нічого не нормалізує в базі — лише читає.
 */
export async function attributeOptions(): Promise<AttributeOption[]> {
	const rows = await prisma.productAttribute.groupBy({
		by: ['name', 'value'],
		_count: { _all: true }
	});

	const byName = new Map<string, { name: string; count: number; values: Map<string, number> }>();

	for (const row of rows) {
		const name = row.name.trim();
		if (name === '') continue;

		const key = name.toLowerCase();
		let entry = byName.get(key);
		if (!entry) {
			entry = { name, count: 0, values: new Map() };
			byName.set(key, entry);
		}

		entry.count += row._count._all;

		const value = row.value.trim();
		if (value !== '') entry.values.set(value, (entry.values.get(value) ?? 0) + row._count._all);
	}

	// Стандартні назви мають бути в підказках навіть на порожній базі —
	// інакше перший товар довелось би набирати наосліп.
	for (const name of DEFAULT_ATTRIBUTE_NAMES) {
		const key = name.toLowerCase();
		if (!byName.has(key)) byName.set(key, { name, count: 0, values: new Map() });
	}

	return [...byName.values()]
		.sort((a, b) => b.count - a.count)
		.map((entry) => ({
			name: entry.name,
			// «Склад» — вільний текст, там значень стільки ж, скільки товарів:
			// у список беремо найчастіші, решта все одно набирається руками.
			values: [...entry.values.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, MAX_VALUES)
				.map(([value]) => value)
		}));
}
