import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { funnel, rate } from '$lib/traffic';
import { resolveRange } from '$lib/server/traffic-range';

const db = vi.hoisted(() => ({ queryRaw: vi.fn(), orderCount: vi.fn() }));

// Лише читання: у моку немає жодного методу, яким можна було б щось записати.
vi.mock('$lib/server/db', () => ({
	prisma: { $queryRaw: db.queryRaw, order: { count: db.orderCount } }
}));

const { load } = await import('../src/routes/(app)/traffic/+page.server');

type Loaded = {
	state: 'missing' | 'empty' | 'ready';
	source: string | null;
	range: { key: string; from: string; to: string; days: number };
	series?: { key: string; visitors: number }[];
	totals?: { visitors: number; ordered: number; conversion: number | null };
};

function open(search = '', role = 'MANAGER') {
	return (load as unknown as (e: unknown) => Promise<Loaded>)({
		url: new URL(`http://localhost/traffic${search}`),
		locals: { user: { id: 'u1', role } }
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

/** Відповіді в тому порядку, у якому їх просить завантажувач. */
function answers(totals: object = TOTALS, days: object[] = []) {
	db.queryRaw
		.mockResolvedValueOnce([totals])
		.mockResolvedValueOnce(days)
		.mockResolvedValueOnce([{ source: 'facebook', ...totals }])
		.mockResolvedValueOnce([])
		.mockResolvedValueOnce([])
		.mockResolvedValueOnce([]);
	db.orderCount.mockResolvedValue(3);
}

/** Значення параметрів tagged template першого запиту: [start, end, source, source]. */
function params(call = 0): unknown[] {
	return db.queryRaw.mock.calls[call].slice(1);
}

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

	it('оператора не пускає', async () => {
		await expect(open('', 'OPERATOR')).rejects.toSatisfy(isHttpError);
		expect(db.queryRaw).not.toHaveBeenCalled();
	});

	it('усі запити йдуть одним пакетом', async () => {
		answers();
		await open();

		// Шість звітів і звірка з замовленнями CRM — жодної послідовної подорожі.
		expect(db.queryRaw).toHaveBeenCalledTimes(6);
		expect(db.orderCount).toHaveBeenCalledTimes(1);
	});

	it('межі періоду — київські півночі в UTC', async () => {
		answers();
		await open('?range=7');

		// Кінець вересня — літній час, Київ на UTC+3.
		const [start, end] = params() as Date[];
		expect(start.toISOString()).toBe('2026-09-21T21:00:00.000Z');
		expect(end.toISOString()).toBe('2026-09-28T21:00:00.000Z');
	});

	it('джерело з білого списку йде в запит параметром', async () => {
		answers();
		const data = await open('?source=facebook');

		expect(data.source).toBe('facebook');
		expect(params()).toContain('facebook');
	});

	it('незнайоме джерело — це «усі», а не текст у запиті', async () => {
		answers();
		const data = await open("?source=facebook'--");

		expect(data.source).toBeNull();
		expect(params()).not.toContain("facebook'--");
	});

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
		answers({ ...TOTALS, visitors: 0 });
		expect((await open()).state).toBe('empty');
	});

	it('дні без відвідувачів — нулі, а не дірка в графіку', async () => {
		answers(TOTALS, [{ day: '2026-09-25', visitors: 40, views: 90 }]);

		const data = await open('?range=7');

		expect(data.series).toHaveLength(7);
		expect(data.series?.find((point) => point.key === '2026-09-25')?.visitors).toBe(40);
		expect(data.series?.filter((point) => point.visitors === 0)).toHaveLength(6);
	});

	it('конверсія — замовили ÷ відвідувачі', async () => {
		answers();
		const data = await open();

		expect(data.totals).toMatchObject({ visitors: 100, ordered: 3, conversion: 3 });
	});
});
