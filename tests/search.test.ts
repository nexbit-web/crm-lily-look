import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from './helpers/deferred';
import { highlight, isScope } from '$lib/search';
import { isActive, navFor } from '$lib/nav';

const db = vi.hoisted(() => ({
	products: vi.fn(),
	orders: vi.fn(),
	categories: vi.fn()
}));

// Лише читання: у моку немає жодного методу запису.
vi.mock('$lib/server/db', () => ({
	prisma: {
		product: { findMany: db.products },
		order: { findMany: db.orders },
		category: { findMany: db.categories }
	}
}));

const { search, normalizeQuery } = await import('$lib/server/search');
const { GET } = await import('../src/routes/api/search/+server');

const PRODUCT = {
	id: 'p1',
	name: 'Пальто беж',
	price: 300000,
	finalPrice: 240000,
	isActive: true,
	category: { name: 'Пальта' },
	images: [{ url: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg' }]
};
const ORDER = {
	id: 'o1',
	number: 'LL-2K4F7B',
	customerName: 'Олена Коваль',
	total: 240000,
	status: 'NEW',
	createdAt: new Date('2026-10-19T10:00:00Z')
};
const CATEGORY = {
	id: 'c1',
	name: 'Пальта',
	parent: { name: 'Верхній одяг' },
	_count: { products: 12 }
};

beforeEach(() => {
	db.products.mockReset().mockResolvedValue([PRODUCT]);
	db.orders.mockReset().mockResolvedValue([ORDER]);
	db.categories.mockReset().mockResolvedValue([CATEGORY]);
});

describe('пошук: що знаходить', () => {
	it('товари, замовлення й категорії — у вигляді, готовому для модалки', async () => {
		const result = await search('пальто', 'all');

		expect(result.products).toEqual([
			{
				id: 'p1',
				name: 'Пальто беж',
				category: 'Пальта',
				image: 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg',
				// Ціна, яку бачить покупець, — зі знижкою.
				price: 240000,
				isActive: true
			}
		]);
		expect(result.orders).toEqual([
			{
				id: 'o1',
				number: 'LL-2K4F7B',
				customer: 'Олена Коваль',
				total: 240000,
				status: 'NEW',
				createdAt: '2026-10-19T10:00:00.000Z'
			}
		]);
		expect(result.categories).toEqual([
			{ id: 'c1', name: 'Пальта', parent: 'Верхній одяг', products: 12 }
		]);
	});

	it('товар шукає за назвою, адресою й артикулом варіанта, без різниці в регістрі', async () => {
		await search('LL-palto', 'products');

		const { OR } = db.products.mock.calls[0][0].where;
		expect(OR).toEqual([
			{ name: { contains: 'LL-palto', mode: 'insensitive' } },
			{ slug: { contains: 'LL-palto', mode: 'insensitive' } },
			{ variants: { some: { sku: { contains: 'LL-palto', mode: 'insensitive' } } } }
		]);
	});

	it('замовлення — за номером, імʼям і телефоном (за цифрами, без пробілів і плюса)', async () => {
		await search('+380 67 123', 'orders');

		const { OR } = db.orders.mock.calls[0][0].where;
		expect(OR).toContainEqual({ customerPhone: { contains: '38067123' } });
		expect(OR).toContainEqual({ number: { contains: '+380 67 123', mode: 'insensitive' } });
	});

	it('коротка цифрова частина не шукає по телефону — інакше «1» знайде все', async () => {
		await search('Ол 1', 'orders');

		const { OR } = db.orders.mock.calls[0][0].where;
		expect(OR.some((item: object) => 'customerPhone' in item)).toBe(false);
	});

	it('без знижки — звичайна ціна', async () => {
		db.products.mockResolvedValue([{ ...PRODUCT, finalPrice: 0 }]);
		expect((await search('пальто', 'all')).products[0].price).toBe(300000);
	});

	it('нові замовлення — першими', async () => {
		await search('Олена', 'orders');
		expect(db.orders.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
	});
});

describe('пошук: навантаження на базу', () => {
	it('менше двох літер — без жодного запиту', async () => {
		for (const query of ['', ' ', 'п', '  п  ']) {
			expect(await search(query, 'all')).toMatchObject({
				products: [],
				orders: [],
				categories: []
			});
		}
		expect(db.products).not.toHaveBeenCalled();
		expect(db.orders).not.toHaveBeenCalled();
	});

	it('три групи шукаються одночасно', async () => {
		const gate = deferred<unknown[]>();
		db.products.mockReturnValue(gate.promise);
		db.orders.mockReturnValue(gate.promise);
		db.categories.mockReturnValue(gate.promise);

		const result = search('пальто', 'all');
		await Promise.resolve();

		expect(db.products).toHaveBeenCalledTimes(1);
		expect(db.orders).toHaveBeenCalledTimes(1);
		expect(db.categories).toHaveBeenCalledTimes(1);
		gate.resolve([]);
		await result;
	});

	it('«Усе» бере по 5 з групи, окрема вкладка — до 20', async () => {
		await search('пальто', 'all');
		expect(db.products.mock.calls[0][0].take).toBe(5);

		await search('пальто', 'products');
		expect(db.products.mock.calls[1][0].take).toBe(20);
	});

	it('вкладка шукає лише своє — інші таблиці не чіпає', async () => {
		await search('пальто', 'orders');

		expect(db.orders).toHaveBeenCalledTimes(1);
		expect(db.products).not.toHaveBeenCalled();
		expect(db.categories).not.toHaveBeenCalled();
	});

	it('з бази беремо лише потрібні поля й одне фото', async () => {
		await search('пальто', 'all');

		const { select } = db.products.mock.calls[0][0];
		expect(select.images).toMatchObject({ take: 1 });
		expect(select).not.toHaveProperty('description');
		expect(Object.keys(db.orders.mock.calls[0][0].select)).not.toContain('customerPhone');
	});
});

describe('пошук: безпека й надійність', () => {
	it('запит обрізається й чиститься від зайвих пробілів', () => {
		expect(normalizeQuery('  пальто   беж ')).toBe('пальто беж');
		expect(normalizeQuery('x'.repeat(500))).toHaveLength(64);
		expect(normalizeQuery(null)).toBe('');
	});

	it('API: невідома область — «Усе», а не помилка', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/search?q=пальто&scope=DROP')
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.products).toHaveLength(1);
		expect(db.categories).toHaveBeenCalled();
	});

	it('API: «Розділи» шукає сама модалка — до бази не йде окремою вкладкою', async () => {
		await GET({ url: new URL('http://localhost/api/search?q=пальто&scope=pages') } as never);
		expect(db.products.mock.calls[0][0].take).toBe(5);
	});

	it('API: текст запиту не потрапляє в SQL — лише як значення фільтра Prisma', async () => {
		await GET({
			url: new URL(`http://localhost/api/search?q=${encodeURIComponent("'; DROP TABLE x;--")}`)
		} as never);
		expect(db.products.mock.calls[0][0].where.OR[0].name.contains).toBe("'; DROP TABLE x;--");
	});

	it('підсвітка — шматками тексту, без HTML', () => {
		expect(highlight('Пальто беж', 'бЕж')).toEqual([
			{ text: 'Пальто ', match: false },
			{ text: 'беж', match: true }
		]);
		expect(highlight('<b>x</b>', 'x')).toEqual([
			{ text: '<b>', match: false },
			{ text: 'x', match: true },
			{ text: '</b>', match: false }
		]);
		expect(highlight('аааа', '')).toEqual([{ text: 'аааа', match: false }]);
	});

	it('області пошуку — лише відомі', () => {
		expect(isScope('orders')).toBe(true);
		expect(isScope('users')).toBe(false);
	});
});

describe('розділи для сайдбару й пошуку', () => {
	it('оператор не бачить статистики, знижок, команди й бота', () => {
		const hrefs = navFor('OPERATOR').map((item) => item.href);
		expect(hrefs).toEqual(['/orders', '/products', '/categories']);
	});

	it('адміністратор бачить усе', () => {
		expect(navFor('ADMIN').map((item) => item.href)).toContain('/traffic');
	});

	it('невідома роль — найменші права', () => {
		expect(navFor('HACKER')).toEqual(navFor('OPERATOR'));
		expect(navFor(null)).toEqual(navFor('OPERATOR'));
	});

	it('активний розділ — і на підсторінці, але не на схожій адресі', () => {
		expect(isActive('/products/abc', '/products')).toBe(true);
		expect(isActive('/products', '/products')).toBe(true);
		expect(isActive('/products-old', '/products')).toBe(false);
	});

	it('підписи в сайдбарі короткі — влазять у вузьку колонку', () => {
		for (const item of navFor('ADMIN')) expect(item.short.length).toBeLessThanOrEqual(10);
	});
});
