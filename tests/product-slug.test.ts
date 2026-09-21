import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('$lib/server/db', () => ({ prisma: { product: { findMany } } }));

const { uniqueProductSlug } = await import('$lib/server/product-slug');

type Row = { id: string; slug: string };

function taken(...slugs: string[]) {
	findMany.mockResolvedValue(slugs.map((slug, index) => ({ id: `id-${index}`, slug }) as Row));
}

/**
 * Оптимізація. Раніше тут крутився цикл із findUnique на кожну спробу — до 50
 * походів до Neon на одне збереження. Тепер усе має вміщатись в один запит,
 * і саме це перевіряє перший тест: він же ловить повернення циклу назад.
 */
describe('вільна адреса товару', () => {
	beforeEach(() => {
		findMany.mockReset();
		taken();
	});

	it('робить рівно один запит до бази, скільки б не було зайнятих адрес', async () => {
		taken('suknia', 'suknia-2', 'suknia-3', 'suknia-4', 'suknia-5');

		await uniqueProductSlug('suknia');

		expect(findMany).toHaveBeenCalledTimes(1);
	});

	it('бере з бази лише те, що потрібно для вибору суфікса', async () => {
		await uniqueProductSlug('suknia');

		expect(findMany).toHaveBeenCalledWith({
			where: { slug: { startsWith: 'suknia' } },
			select: { id: true, slug: true }
		});
	});

	it('вільну адресу віддає як є', async () => {
		taken('kofta');
		expect(await uniqueProductSlug('suknia')).toBe('suknia');
	});

	it('на зайнятій адресі додає найменший вільний суфікс', async () => {
		taken('suknia', 'suknia-2', 'suknia-4');
		expect(await uniqueProductSlug('suknia')).toBe('suknia-3');
	});

	it('товар не конкурує сам із собою при перейменуванні', async () => {
		// Інакше кожне збереження зсувало б адресу: suknia → suknia-2 → suknia-3.
		findMany.mockResolvedValue([{ id: 'p1', slug: 'suknia' }]);
		expect(await uniqueProductSlug('suknia', 'p1')).toBe('suknia');
		expect(await uniqueProductSlug('suknia', 'p2')).toBe('suknia-2');
	});

	it('порожня назва не дає порожню адресу', async () => {
		expect(await uniqueProductSlug('')).toBe('tovar');
	});

	it('завжди повертає щось вільне, навіть коли зайнято всі суфікси поспіль', async () => {
		taken('suknia', 'suknia-2', 'suknia-3', 'suknia-4', 'suknia-5', 'suknia-6', 'suknia-7');

		const slug = await uniqueProductSlug('suknia');
		expect(slug.startsWith('suknia')).toBe(true);
		expect(slug).not.toBe('suknia');
	});
});
