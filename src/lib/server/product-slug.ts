import { prisma } from './db';

/**
 * Вільна адреса товару: `base`, далі `base-2`, `base-3`…
 *
 * Один запит замість перебору. Раніше тут крутився цикл із findUnique на кожну
 * спробу — до 50 походів до бази на одне збереження; тепер беремо всі зайняті
 * адреси з цим префіксом і шукаємо вільний суфікс уже в памʼяті.
 *
 * `exceptId` — товар, який саме зберігається: власну адресу він має право
 * залишити за собою.
 */
export async function uniqueProductSlug(base: string, exceptId?: string): Promise<string> {
	const fallback = base || 'tovar';

	const taken = await prisma.product.findMany({
		where: { slug: { startsWith: fallback } },
		select: { id: true, slug: true }
	});

	const used = new Set(taken.filter((row) => row.id !== exceptId).map((row) => row.slug));

	if (!used.has(fallback)) return fallback;

	// Суфіксів рівно стільки ж, скільки зайнятих адрес, плюс один — тож
	// вільний знайдеться завжди, і цикл не може стати нескінченним.
	for (let suffix = 2; suffix <= used.size + 2; suffix += 1) {
		const candidate = `${fallback}-${suffix}`;
		if (!used.has(candidate)) return candidate;
	}

	return `${fallback}-${Date.now()}`;
}
