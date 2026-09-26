import { prisma } from './db';
import { skuFor } from '$lib/sku';

type Variant = {
	/** Порожній id — варіант щойно додали у формі. */
	id?: string;
	sku: string;
	size: string;
	color: string;
};

/**
 * Проставляє артикули варіантам товару.
 *
 * Порожній `sku` означає «збери за правилом»; непорожній менеджер вписав
 * руками, і ми його не чіпаємо.
 *
 * `sku` у базі унікальний на всю таблицю, тож зайняті адреси беремо одним
 * запитом: усі артикули, що починаються з адреси цього товару, за винятком
 * його власних варіантів — їх ми саме зараз і переписуємо.
 */
export async function assignSkus<T extends Variant>(
	slug: string,
	variants: T[],
	productId?: string
): Promise<(T & { sku: string })[]> {
	const taken = await prisma.productVariant.findMany({
		where: {
			sku: { startsWith: `${slug}-` },
			...(productId ? { NOT: { productId } } : {})
		},
		select: { sku: true }
	});

	const used = new Set(taken.map((row) => row.sku));

	// Артикули, вписані руками, теж займають місце — інакше згенерований міг
	// би збігтися з сусіднім рядком цієї ж форми.
	for (const variant of variants) {
		if (variant.sku.trim() !== '') used.add(variant.sku.trim());
	}

	return variants.map((variant) => {
		const manual = variant.sku.trim();
		if (manual !== '') return { ...variant, sku: manual };

		const base = skuFor(slug, variant.size, variant.color);
		let candidate = base;
		for (let suffix = 2; used.has(candidate); suffix += 1) candidate = `${base}-${suffix}`;

		used.add(candidate);
		return { ...variant, sku: candidate };
	});
}
