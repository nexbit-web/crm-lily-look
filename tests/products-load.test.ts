import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from './helpers/deferred';

const db = vi.hoisted(() => ({
	categoryFindMany: vi.fn(),
	productFindMany: vi.fn(),
	productGroupBy: vi.fn(),
	productCount: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	prisma: {
		category: { findMany: db.categoryFindMany },
		product: { findMany: db.productFindMany, groupBy: db.productGroupBy, count: db.productCount }
	}
}));

// Згенерований клієнт лежить поза репозиторієм; у завантажувачі з нього
// береться лише тип Prisma.*, тому заглушки досить.
vi.mock('$lib/server/prisma-client/client', () => ({ Prisma: {} }));

const { load } = await import('../src/routes/(app)/products/+page.server');

type Loader = (event: { url: URL }) => Promise<{
	page: number;
	pageCount: number;
	perPage: number;
	total: number;
	sort: string;
	categories: { id: string; count: number; isChild: boolean }[];
	products: { id: string; stock: number; categoryName: string }[];
}>;

const run = load as unknown as Loader;

function open(search = '') {
	return run({ url: new URL(`http://localhost/products${search}`) });
}

/** Усі запити віддають порожньо, якщо тест не сказав інакше. */
function empty(total = 0) {
	db.categoryFindMany.mockResolvedValue([]);
	db.productGroupBy.mockResolvedValue([]);
	db.productCount.mockResolvedValue(total);
	db.productFindMany.mockResolvedValue([]);
}

describe('список товарів', () => {
	beforeEach(() => {
		for (const mock of Object.values(db)) mock.mockReset();
		empty();
	});

	describe('навантаження на базу', () => {
		it('усі чотири запити йдуть паралельно, а не чергою', async () => {
			// На серверлесі все вирішує кількість затримок до Neon: послідовні
			// await коштували б чотирьох подорожей замість однієї.
			const gate = deferred<void>();
			const started: string[] = [];

			const pending = (name: string, value: unknown) =>
				vi.fn(() => {
					started.push(name);
					return gate.promise.then(() => value);
				});

			db.categoryFindMany.mockImplementation(pending('categories', []));
			db.productGroupBy.mockImplementation(pending('groupBy', []));
			db.productCount.mockImplementation(pending('count', 0));
			db.productFindMany.mockImplementation(pending('page', []));

			const result = open();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(started).toHaveLength(4);

			gate.resolve();
			await result;
		});

		it('бере рівно сторінку товарів, а не всю таблицю', async () => {
			await open();

			expect(db.productFindMany).toHaveBeenCalledTimes(1);
			expect(db.productFindMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 15 });
		});

		it('залишок рахується вкладеним select, без другого запиту', async () => {
			await open();

			const args = db.productFindMany.mock.calls[0][0];
			expect(args.select.variants).toEqual({ select: { stock: true } });
			// select, а не include: зайвих колонок з бази не тягнемо.
			expect(args.include).toBeUndefined();
		});

		it('сторінку в межах діапазону не перезапитує', async () => {
			empty(30);
			await open('?page=2');

			expect(db.productFindMany).toHaveBeenCalledTimes(1);
			expect(db.productFindMany.mock.calls[0][0]).toMatchObject({ skip: 15, take: 15 });
		});
	});

	describe('параметри з адреси', () => {
		it('невідоме сортування мовчки стає сортуванням за замовчуванням', async () => {
			// orderBy збирається лише з білого списку — рядок з адреси в запит
			// не потрапляє ніколи.
			await open('?sort=%27%3B+DROP+TABLE+Product');

			expect(db.productFindMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
		});

		it('приймає відомі ключі сортування', async () => {
			await open('?sort=price-desc');
			expect(db.productFindMany.mock.calls[0][0].orderBy).toEqual({ price: 'desc' });
		});

		it('сміття в номері сторінки не ламає вибірку', async () => {
			for (const page of ['abc', '-5', '0', '1e9999', '']) {
				db.productFindMany.mockClear();
				await open(`?page=${page}`);
				expect(db.productFindMany.mock.calls[0][0].skip).toBeGreaterThanOrEqual(0);
			}
		});

		it('сторінка за межами діапазону повертає останню наявну', async () => {
			empty(10);
			const data = await open('?page=99');

			expect(data.page).toBe(1);
			expect(data.pageCount).toBe(1);
			// Перезапит лише в цьому випадку — він рідкісний.
			expect(db.productFindMany).toHaveBeenCalledTimes(2);
			expect(db.productFindMany.mock.calls[1][0].skip).toBe(0);
		});

		it('пошук іде по назві, адресі та SKU', async () => {
			await open('?q=LL-001');

			const where = db.productFindMany.mock.calls[0][0].where;
			expect(where.OR).toHaveLength(3);
			expect(where.OR[2]).toEqual({
				variants: { some: { sku: { contains: 'LL-001', mode: 'insensitive' } } }
			});
		});

		it('фільтр за категорією захоплює підкатегорії', async () => {
			await open('?category=cat-1');

			expect(db.productFindMany.mock.calls[0][0].where.category).toEqual({
				OR: [{ id: 'cat-1' }, { parentId: 'cat-1' }]
			});
		});

		it('лічильники в чипсах не залежать від вибраної категорії', async () => {
			await open('?q=сукня&category=cat-1');

			// Інакше в усіх чипсах, крім вибраного, завжди був би нуль.
			expect(db.productGroupBy.mock.calls[0][0].where.category).toBeUndefined();
		});
	});

	describe('що отримує сторінка', () => {
		it('складає залишок з варіантів і підставляє назву категорії', async () => {
			empty(1);
			db.productFindMany.mockResolvedValue([
				{
					id: 'p1',
					name: 'Сукня',
					slug: 'suknia',
					price: 129900,
					finalPrice: 99900,
					isActive: true,
					isFeatured: false,
					categoryId: 'cat-1',
					category: { name: 'Сукні' },
					images: [{ url: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg' }],
					variants: [{ stock: 2 }, { stock: 3 }, { stock: 0 }]
				}
			]);

			const data = await open();

			expect(data.products[0].stock).toBe(5);
			expect(data.products[0].categoryName).toBe('Сукні');
		});

		it('у батьківській категорії показує і товари підкатегорій', async () => {
			db.categoryFindMany.mockResolvedValue([
				{ id: 'cat-1', name: 'Одяг', parentId: null },
				{ id: 'cat-2', name: 'Сукні', parentId: 'cat-1' }
			]);
			db.productGroupBy.mockResolvedValue([
				{ categoryId: 'cat-1', _count: { _all: 2 } },
				{ categoryId: 'cat-2', _count: { _all: 3 } }
			]);

			const data = await open();

			expect(data.categories[0]).toMatchObject({ id: 'cat-1', count: 5, isChild: false });
			expect(data.categories[1]).toMatchObject({ id: 'cat-2', count: 3, isChild: true });
		});

		it('товар без категорії та без фото не ламає сторінку', async () => {
			empty(1);
			db.productFindMany.mockResolvedValue([
				{
					id: 'p1',
					name: 'Без категорії',
					slug: 'bez',
					price: 100,
					finalPrice: 100,
					isActive: false,
					isFeatured: false,
					categoryId: null,
					category: null,
					images: [],
					variants: []
				}
			]);

			const data = await open();

			expect(data.products[0].categoryName).toBe('—');
			expect(data.products[0].stock).toBe(0);
		});
	});
});
