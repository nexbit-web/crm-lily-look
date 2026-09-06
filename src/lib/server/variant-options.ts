import { prisma } from './db';

export type VariantOptions = {
	/** Розміри, які вже зустрічаються в базі, від найпоширенішого. */
	sizes: string[];
	/** Кольори з базі разом з HEX, щоб нові товари не розходились у написанні. */
	colors: { color: string; colorHex: string | null }[];
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Підказки для полів варіанта, зібрані з наявних товарів.
 *
 * Сенс у тому, щоб «Чорний» лишався одним кольором, а не перетворювався на
 * «чорний»/«Чорний ». Дані лише читаються, нічого не нормалізується в базі.
 */
export async function variantOptions(): Promise<VariantOptions> {
	const [sizeRows, colorRows] = await Promise.all([
		prisma.productVariant.groupBy({ by: ['size'], _count: { _all: true } }),
		prisma.productVariant.groupBy({ by: ['color', 'colorHex'], _count: { _all: true } })
	]);

	// Дублі на кшталт «S» і «s» зводимо до найчастішого написання.
	const sizes = new Map<string, { label: string; count: number }>();
	for (const row of sizeRows) {
		const label = row.size.trim();
		if (label === '') continue;
		const key = label.toUpperCase();
		const seen = sizes.get(key);
		if (!seen || row._count._all > seen.count) {
			sizes.set(key, { label, count: (seen?.count ?? 0) + row._count._all });
		} else {
			seen.count += row._count._all;
		}
	}

	const colors = new Map<string, { color: string; colorHex: string | null; count: number }>();
	for (const row of colorRows) {
		const color = row.color.trim();
		if (color === '') continue;
		const key = color.toLowerCase();
		// «#0000» та інші зіпсовані значення в підказки не пускаємо.
		const colorHex = row.colorHex && HEX.test(row.colorHex.trim()) ? row.colorHex.trim() : null;
		const seen = colors.get(key);
		if (!seen || row._count._all > seen.count) {
			colors.set(key, {
				color,
				colorHex: colorHex ?? seen?.colorHex ?? null,
				count: row._count._all
			});
		}
	}

	return {
		sizes: [...sizes.values()].sort((a, b) => b.count - a.count).map((item) => item.label),
		colors: [...colors.values()]
			.sort((a, b) => a.color.localeCompare(b.color, 'uk'))
			.map(({ color, colorHex }) => ({ color, colorHex }))
	};
}
