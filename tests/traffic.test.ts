import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { funnel, rate } from '$lib/traffic';
import { resolveRange } from '$lib/server/traffic-range';
import { deferred } from './helpers/deferred';

const db = vi.hoisted(() => ({ queryRaw: vi.fn(), orderCount: vi.fn() }));

// Лише читання: у моку немає жодного методу, яким можна було б щось записати.
vi.mock('$lib/server/db', () => ({
	prisma: { $queryRaw: db.queryRaw, order: { count: db.orderCount } }
}));

const { load } = await import('../src/routes/(app)/traffic/+page.server');

/** Порядок запитів у завантажувачі. */
const Q = { totals: 0, days: 1, sources: 2, products: 3, exits: 4, devices: 5, pages: 6 };
const QUERIES = Object.keys(Q).length;

type Step = { key: string; count: number; pass: number | null; worst: boolean };
type Loaded = {
	state: 'missing' | 'empty' | 'ready';
	source: string | null;
	range: { key: string; from: string; to: string; days: number };
	today: string;
	crmOrders?: number;
	series?: { key: string; visitors: number; views: number }[];
	totals?: {
		visitors: number;
		views: number;
		added: number;
		ordered: number;
		conversion: number | null;
	};
	funnel?: Step[];
	sources?: {
		source: string;
		visitors: number;
		ordered: number;
		conversion: number | null;
		funnel: Step[];
	}[];
	products?: {
		path: string;
		id: string | null;
		name: string;
		image: string | null;
		viewed: number;
		added: number;
		rate: number | null;
	}[];
	exits?: { page: string; label: string; count: number; share: number }[];
	devices?: { device: string; label: string; visitors: number; share: number }[];
	pages?: { path: string; label: string; views: number; visitors: number }[];
};

function open(search = '', role: string | null = 'MANAGER') {
	return (load as unknown as (e: unknown) => Promise<Loaded>)({
		url: new URL(`http://localhost/traffic${search}`),
		locals: { user: role ? { id: 'u1', role } : null }
	});
}

const TOTALS = {
	visitors: 100,
	views: 400,
	viewed_product: 60,
	added: 12,
	checkout: 5,
	ordered: 3
};

type Answers = {
	totals?: object;
	days?: object[];
	sources?: object[];
	products?: object[];
	exits?: object[];
	devices?: object[];
	pages?: object[];
	crmOrders?: number;
};

/** Відповіді в тому порядку, у якому їх просить завантажувач. */
function answers(rows: Answers = {}) {
	db.queryRaw
		.mockResolvedValueOnce([rows.totals ?? TOTALS])
		.mockResolvedValueOnce(rows.days ?? [])
		.mockResolvedValueOnce(rows.sources ?? [{ source: 'facebook', ...TOTALS }])
		.mockResolvedValueOnce(rows.products ?? [])
		.mockResolvedValueOnce(rows.exits ?? [])
		.mockResolvedValueOnce(rows.devices ?? [])
		.mockResolvedValueOnce(
			rows.pages ?? [{ page: 'catalog', path: '/catalog/palto', views: 3, visitors: 2 }]
		);
	db.orderCount.mockResolvedValue(rows.crmOrders ?? 3);
}

/** Текст SQL запиту — без значень параметрів. */
function sql(call: number): string {
	return (db.queryRaw.mock.calls[call][0] as TemplateStringsArray).join('$');
}

/** Значення параметрів tagged template запиту. */
function params(call = 0): unknown[] {
	return db.queryRaw.mock.calls[call].slice(1);
}

const iso = (value: unknown) => (value as Date).toISOString();

describe('воронка', () => {
	it('рахує, яка частка дійшла з попереднього кроку', () => {
		const steps = funnel({ visitors: 100, viewedProduct: 60, added: 12, checkout: 6, ordered: 3 });

		expect(steps.map((step) => step.pass)).toEqual([null, 60, 20, 50, 50]);
	});

	it('позначає крок із найбільшим провалом за часткою, а не за кількістю', () => {
		// Між першим і другим кроком губиться 40 людей, між другим і третім — 48,
		// але саме частка (20% дійшло) і показує, де проблема.
		const steps = funnel({ visitors: 100, viewedProduct: 60, added: 12, checkout: 6, ordered: 3 });

		expect(steps.filter((step) => step.worst).map((step) => step.key)).toEqual(['added']);
	});

	it('порожні кроки після нуля не рахуються провалом', () => {
		const steps = funnel({ visitors: 10, viewedProduct: 0, added: 0, checkout: 0, ordered: 0 });

		expect(steps[1].worst).toBe(true);
		expect(steps.slice(2).every((step) => step.pass === null && !step.worst)).toBe(true);
	});

	it('без втрат нічого не підсвічує', () => {
		const steps = funnel({ visitors: 5, viewedProduct: 5, added: 5, checkout: 5, ordered: 5 });
		expect(steps.some((step) => step.worst)).toBe(false);
	});

	it('провал завжди один, навіть якщо кілька кроків однаково погані', () => {
		const steps = funnel({
			visitors: 100,
			viewedProduct: 50,
			added: 25,
			checkout: 20,
			ordered: 10
		});
		expect(steps.filter((step) => step.worst)).toHaveLength(1);
	});

	it('частка від нуля — прочерк, а не ділення на нуль', () => {
		expect(rate(3, 0)).toBeNull();
		expect(rate(1, 3)).toBe(33);
	});
});

describe('період', () => {
	const today = '2026-09-28';
	const at = (query: string) => resolveRange(new URLSearchParams(query), today);

	it('готові періоди — включно з сьогодні', () => {
		expect(at('range=today')).toMatchObject({ from: today, to: today, days: 1 });
		expect(at('range=yesterday')).toMatchObject({ from: '2026-09-27', to: '2026-09-27' });
		expect(at('range=7')).toMatchObject({ from: '2026-09-22', to: today, days: 7 });
		expect(at('range=30')).toMatchObject({ from: '2026-08-30', to: today, days: 30 });
	});

	it('без параметра — 7 днів', () => {
		expect(at('')).toMatchObject({ key: '7', days: 7 });
		expect(at('range=DROP')).toMatchObject({ key: '7' });
	});

	it('власний період приймає коректні дати', () => {
		expect(at('range=custom&from=2026-09-01&to=2026-09-10')).toMatchObject({
			key: 'custom',
			days: 10
		});
	});

	it('майбутнє обрізає до сьогодні', () => {
		expect(at('range=custom&from=2026-09-20&to=2027-01-01')).toMatchObject({ to: today });
	});

	it('неіснуючі дати, перевернутий і надто довгий період — назад до 7 днів', () => {
		for (const query of [
			'range=custom&from=2026-02-31&to=2026-03-05',
			'range=custom&from=2026-09-10&to=2026-09-01',
			'range=custom&from=2020-01-01&to=2026-09-01',
			'range=custom&from=вчора&to=сьогодні',
			'range=custom'
		]) {
			expect(at(query)).toMatchObject({ key: '7' });
		}
	});
});

describe('сторінка відвідуваності', () => {
	beforeEach(() => {
		db.queryRaw.mockReset();
		db.orderCount.mockReset();
		vi.useFakeTimers();
		// Полудень за Києвом: день точно не перескочить на сусідній.
		vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
	});

	afterEach(() => vi.useRealTimers());

	describe('безпека', () => {
		it('оператора не пускає', async () => {
			await expect(open('', 'OPERATOR')).rejects.toSatisfy(isHttpError);
			expect(db.queryRaw).not.toHaveBeenCalled();
		});

		it('без сесії — 403 і жодного запиту', async () => {
			await expect(open('', null)).rejects.toSatisfy(isHttpError);
			expect(db.queryRaw).not.toHaveBeenCalled();
			expect(db.orderCount).not.toHaveBeenCalled();
		});

		it('адміністратора пускає', async () => {
			answers();
			expect((await open('', 'ADMIN')).state).toBe('ready');
		});

		it('кожен запит — лише SELECT, жодного запису в таблицю сайту', async () => {
			answers();
			await open();

			for (let call = 0; call < QUERIES; call++) {
				expect(sql(call).trim()).toMatch(/^SELECT\b/i);
				expect(sql(call)).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
			}
		});

		it('те, що прийшло з адреси, ніколи не потрапляє в текст SQL', async () => {
			answers();
			await open('?source=facebook&range=custom&from=2026-09-01&to=2026-09-10');

			for (let call = 0; call < QUERIES; call++) {
				expect(sql(call)).not.toContain('facebook');
				expect(sql(call)).not.toContain('2026-09');
			}
		});

		it('дати періоду йдуть у запит як Date, а не рядком з адреси', async () => {
			answers();
			await open('?range=custom&from=2026-09-01&to=2026-09-10');

			const [start, end] = params(Q.totals);
			expect(start).toBeInstanceOf(Date);
			expect(end).toBeInstanceOf(Date);
		});

		it('незнайоме джерело — це «усі», а не текст у запиті', async () => {
			answers();
			const data = await open("?source=facebook'--");

			expect(data.source).toBeNull();
			for (let call = 0; call < QUERIES; call++) {
				expect(params(call)).not.toContain("facebook'--");
			}
		});
	});

	describe('навантаження на базу', () => {
		it('усі запити йдуть одним пакетом', async () => {
			answers();
			await open();

			// Сім звітів і звірка з замовленнями CRM — жодної послідовної подорожі.
			expect(db.queryRaw).toHaveBeenCalledTimes(QUERIES);
			expect(db.orderCount).toHaveBeenCalledTimes(1);
		});

		it('жоден запит не чекає на інший', async () => {
			const pending = Array.from({ length: QUERIES }, () => deferred<unknown[]>());
			pending.forEach((item) => db.queryRaw.mockReturnValueOnce(item.promise));
			const orders = deferred<number>();
			db.orderCount.mockReturnValueOnce(orders.promise);

			const result = open();
			await Promise.resolve();

			// Жодна відповідь ще не прийшла, а всі запити вже в дорозі.
			expect(db.queryRaw).toHaveBeenCalledTimes(QUERIES);
			expect(db.orderCount).toHaveBeenCalledTimes(1);

			pending.forEach((item, index) => item.resolve(index === Q.totals ? [TOTALS] : []));
			orders.resolve(0);
			expect((await result).state).toBe('ready');
		});

		it('перевірка наявності таблиці — лише коли запит упав', async () => {
			answers();
			await open();

			// Жодного зайвого to_regclass у звичайному випадку.
			expect(db.queryRaw).toHaveBeenCalledTimes(QUERIES);
			for (let call = 0; call < QUERIES; call++) {
				expect(sql(call)).not.toContain('to_regclass');
			}
		});

		it('кількість запитів не залежить від кількості товарів', async () => {
			// Фото товару береться в тому ж запиті, а не окремо на кожен рядок.
			const products = Array.from({ length: 20 }, (_, index) => ({
				path: `/product/item-${index}`,
				id: `p${index}`,
				name: `Товар ${index}`,
				image: null,
				viewed: 10,
				added: 1
			}));
			answers({ products });

			const data = await open();

			expect(data.products).toHaveLength(20);
			expect(db.queryRaw).toHaveBeenCalledTimes(QUERIES);
		});

		it('кожен запит обмежений періодом — база не читає всю таблицю', async () => {
			answers();
			await open();

			for (let call = 0; call < QUERIES; call++) {
				expect(sql(call)).toMatch(/"createdAt" >= \$ AND [a-z.]*"createdAt" < \$/);
			}
			expect(db.orderCount.mock.calls[0][0]).toMatchObject({
				where: { createdAt: { gte: expect.any(Date), lt: expect.any(Date) } }
			});
		});

		it('списки товарів і сторінок обмежені — відповідь не росте з таблицею', async () => {
			answers();
			await open();

			for (const call of [Q.products, Q.pages]) {
				expect(sql(call)).toMatch(/LIMIT \$\s*$/);
				expect(params(call).at(-1)).toBe(20);
			}
		});

		it('порожній звіт не тягне зайвого на сторінку', async () => {
			answers({ totals: { ...TOTALS, visitors: 0 } });
			const data = await open();

			expect(data.state).toBe('empty');
			expect(data).not.toHaveProperty('series');
			expect(data).not.toHaveProperty('products');
		});
	});

	describe('період і джерело в запитах', () => {
		it('межі періоду — київські півночі в UTC', async () => {
			answers();
			await open('?range=7');

			// Кінець вересня — літній час, Київ на UTC+3.
			const [start, end] = params() as Date[];
			expect(start.toISOString()).toBe('2026-09-21T21:00:00.000Z');
			expect(end.toISOString()).toBe('2026-09-28T21:00:00.000Z');
		});

		it('перехід на зимовий час не зсуває межі', async () => {
			vi.setSystemTime(new Date('2026-11-02T09:00:00Z'));
			answers();
			await open('?range=custom&from=2026-10-24&to=2026-10-26');

			// 24 жовтня ще UTC+3, 27 жовтня вже UTC+2.
			const [start, end] = params() as Date[];
			expect(start.toISOString()).toBe('2026-10-23T21:00:00.000Z');
			expect(end.toISOString()).toBe('2026-10-26T22:00:00.000Z');
		});

		it('«сьогодні» після київської півночі — вже новий день', async () => {
			// 01:30 за Києвом 29-го, а в UTC ще 28-ме.
			vi.setSystemTime(new Date('2026-09-28T22:30:00Z'));
			answers();
			const data = await open('?range=today');

			expect(data.today).toBe('2026-09-29');
			expect(iso(params()[0])).toBe('2026-09-28T21:00:00.000Z');
		});

		it('усі звіти й звірка з CRM рахуються за той самий період', async () => {
			answers();
			await open('?range=30');

			const [start, end] = params(Q.totals).slice(0, 2).map(iso);
			for (let call = 0; call < QUERIES; call++) {
				const dates = params(call)
					.filter((value) => value instanceof Date)
					.map(iso);
				expect(new Set(dates)).toEqual(new Set([start, end]));
			}
			const where = db.orderCount.mock.calls[0][0].where.createdAt;
			expect([iso(where.gte), iso(where.lt)]).toEqual([start, end]);
		});

		it('джерело з білого списку йде в запит параметром', async () => {
			answers();
			const data = await open('?source=facebook');

			expect(data.source).toBe('facebook');
			expect(params()).toContain('facebook');
		});

		it('фільтр джерела діє на всі звіти, крім порівняння джерел', async () => {
			answers();
			await open('?source=instagram');

			for (let call = 0; call < QUERIES; call++) {
				if (call === Q.sources) expect(params(call)).not.toContain('instagram');
				else expect(params(call)).toContain('instagram');
			}
		});

		it('без фільтра джерело передається як NULL — показуються всі', async () => {
			answers();
			await open();

			expect(params(Q.totals)).toContain(null);
			expect(sql(Q.totals)).toContain('::text IS NULL OR source = ');
		});
	});

	describe('дані на сторінці', () => {
		it('без таблиці показує «даних немає», а не падає', async () => {
			// Таблицю створює сайт і вона могла ще не зʼявитись.
			db.queryRaw.mockRejectedValueOnce(new Error('relation "PageEvent" does not exist'));
			db.queryRaw.mockResolvedValue([{ exists: false }]);
			db.orderCount.mockResolvedValue(0);

			const data = await open();

			expect(data.state).toBe('missing');
		});

		it('інші помилки бази не ховає за «даних немає»', async () => {
			db.queryRaw.mockRejectedValueOnce(new Error('timeout'));
			db.queryRaw.mockResolvedValue([{ exists: true }]);
			db.orderCount.mockResolvedValue(0);

			await expect(open()).rejects.toThrow('timeout');
		});

		it('порожня таблиця — «даних немає»', async () => {
			answers({ totals: { ...TOTALS, visitors: 0 } });
			expect((await open()).state).toBe('empty');
		});

		it('підсумки беруться з бази як є', async () => {
			answers({ crmOrders: 4 });
			const data = await open();

			expect(data.totals).toEqual({
				visitors: 100,
				views: 400,
				added: 12,
				ordered: 3,
				conversion: 3
			});
			expect(data.crmOrders).toBe(4);
		});

		it('воронка — пʼять кроків з бази в правильному порядку', async () => {
			answers();
			const data = await open();

			expect(data.funnel?.map((step) => [step.key, step.count])).toEqual([
				['visitors', 100],
				['viewedProduct', 60],
				['added', 12],
				['checkout', 5],
				['ordered', 3]
			]);
		});

		it('дні без відвідувачів — нулі, а не дірка в графіку', async () => {
			answers({ days: [{ day: '2026-09-25', visitors: 40, views: 90 }] });

			const data = await open('?range=7');

			expect(data.series).toHaveLength(7);
			expect(data.series?.find((point) => point.key === '2026-09-25')).toMatchObject({
				visitors: 40,
				views: 90
			});
			expect(data.series?.filter((point) => point.visitors === 0)).toHaveLength(6);
		});

		it('дні графіка йдуть підряд від початку до кінця періоду', async () => {
			answers();
			const data = await open('?range=30');

			const keys = data.series?.map((point) => point.key) ?? [];
			expect(keys[0]).toBe(data.range.from);
			expect(keys.at(-1)).toBe(data.range.to);
			expect(new Set(keys).size).toBe(30);
			expect([...keys].sort()).toEqual(keys);
		});

		it('джерела: у кожного своя воронка й конверсія', async () => {
			answers({
				sources: [
					{ source: 'facebook', ...TOTALS },
					{ source: 'direct', ...TOTALS, visitors: 10, ordered: 0 }
				]
			});
			const data = await open();

			expect(data.sources?.map((row) => [row.source, row.conversion])).toEqual([
				['facebook', 3],
				['direct', 0]
			]);
			expect(data.sources?.[0].funnel.map((step) => step.count)).toEqual([100, 60, 12, 5, 3]);
		});

		it('товари: частка додавань і назва видаленого товару', async () => {
			answers({
				products: [
					{
						path: '/product/palto-bez',
						id: 'p1',
						name: 'Пальто',
						image: 'https://x/a.jpg',
						viewed: 8,
						added: 2
					},
					{ path: '/product/stare', id: null, name: null, image: null, viewed: 3, added: 0 }
				]
			});
			const data = await open();

			expect(data.products).toEqual([
				{
					path: '/product/palto-bez',
					id: 'p1',
					name: 'Пальто',
					image: 'https://x/a.jpg',
					viewed: 8,
					added: 2,
					rate: 25
				},
				// Товару вже немає — показуємо хоча б адресу, а не порожній рядок.
				{
					path: '/product/stare',
					id: null,
					name: 'stare',
					image: null,
					viewed: 3,
					added: 0,
					rate: 0
				}
			]);
		});

		it('де йдуть: назви сторінок і частки від усіх, хто пішов', async () => {
			answers({
				exits: [
					{ page: 'home', count: 3 },
					{ page: 'mystery', count: 1 }
				]
			});
			const data = await open();

			expect(data.exits).toEqual([
				{ page: 'home', label: 'Головна', count: 3, share: 75 },
				// Невідомий тип сторінки показуємо як є, а не губимо.
				{ page: 'mystery', label: 'mystery', count: 1, share: 25 }
			]);
		});

		it('пристрої: назви й частки', async () => {
			answers({
				devices: [
					{ device: 'mobile', visitors: 9 },
					{ device: 'desktop', visitors: 1 }
				]
			});
			const data = await open();

			expect(data.devices).toEqual([
				{ device: 'mobile', label: 'Телефон', visitors: 9, share: 90 },
				{ device: 'desktop', label: 'Компʼютер', visitors: 1, share: 10 }
			]);
		});

		it('показує всі відкриті сторінки, а не лише кроки воронки', async () => {
			// Саме цього бракувало: каталог не є кроком воронки й губився.
			answers({
				pages: [
					{ page: 'home', path: '/', views: 9, visitors: 8 },
					{ page: 'catalog', path: '/catalog/palto', views: 1, visitors: 1 },
					{ page: 'blog', path: '/blog/new', views: 1, visitors: 1 }
				]
			});
			const data = await open();

			expect(data.pages).toEqual([
				{ path: '/', label: 'Головна', views: 9, visitors: 8 },
				{ path: '/catalog/palto', label: 'Каталог', views: 1, visitors: 1 },
				{ path: '/blog/new', label: 'blog', views: 1, visitors: 1 }
			]);
		});

		it('сторінки рахують лише перегляди, популярні зверху', async () => {
			answers();
			await open();

			expect(sql(Q.pages)).toContain("type = 'view'");
			expect(sql(Q.pages)).toMatch(/ORDER BY views DESC/);
		});

		it('людей рахує унікальними, а не рядками подій', async () => {
			answers();
			await open();

			for (const call of [Q.totals, Q.days, Q.sources, Q.devices, Q.pages]) {
				expect(sql(call)).toContain('count(DISTINCT "visitorId")');
			}
		});
	});
});
