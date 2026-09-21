import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { deferred } from './helpers/deferred';
import { isPeriod, PERIOD_DAYS, PERIODS } from '$lib/statistics';

const db = vi.hoisted(() => ({
	orderAggregate: vi.fn(),
	orderGroupBy: vi.fn(),
	itemAggregate: vi.fn(),
	queryRaw: vi.fn(),
	variantFindMany: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	prisma: {
		order: { aggregate: db.orderAggregate, groupBy: db.orderGroupBy },
		orderItem: { aggregate: db.itemAggregate },
		productVariant: { findMany: db.variantFindMany },
		$queryRaw: db.queryRaw
	}
}));

const { load } = await import('../src/routes/(app)/statistics/+page.server');

type Result = {
	period: string;
	days: number;
	bucket: number;
	metrics: Record<string, { value: number; delta: number | null }>;
	series: { key: string; revenue: number; orders: number }[];
};

function open(role: string | null, search = '') {
	const event = {
		url: new URL(`http://localhost/statistics${search}`),
		locals: { user: role === null ? null : { id: 'u1', role } }
	};
	return (load as unknown as (e: unknown) => Promise<Result>)(event);
}

/** Усі вісім запитів віддають «порожню» відповідь потрібної форми. */
function empty() {
	db.orderAggregate.mockResolvedValue({ _sum: { total: 0 }, _count: { _all: 0 } });
	db.itemAggregate.mockResolvedValue({ _sum: { quantity: 0 } });
	db.orderGroupBy.mockResolvedValue([]);
	db.queryRaw.mockResolvedValue([]);
	db.variantFindMany.mockResolvedValue([]);
}

describe('періоди', () => {
	it('приймає лише відомі значення', () => {
		expect(PERIODS.every(isPeriod)).toBe(true);
		for (const bad of ['0', '31', '-7', '1e3', 'усі', '']) expect(isPeriod(bad)).toBe(false);
	});
});

describe('сторінка статистики', () => {
	beforeEach(() => {
		for (const mock of Object.values(db)) mock.mockReset();
		empty();
	});

	describe('доступ', () => {
		it('оператора й гостя не пускає — на сторінці виручка', async () => {
			// Сайдбар цей пункт ховає, але прямий перехід за адресою має
			// впертись у ту саму перевірку.
			for (const role of [null, 'OPERATOR', 'operator', 'SUPERUSER', '']) {
				await expect(open(role)).rejects.toSatisfy(isHttpError);
				await open(role).catch((err: { status: number }) => expect(err.status).toBe(403));
			}

			expect(db.orderAggregate).not.toHaveBeenCalled();
		});

		it('менеджера й адміністратора пускає', async () => {
			for (const role of ['MANAGER', 'ADMIN']) {
				await expect(open(role)).resolves.toBeTruthy();
			}
		});
	});

	describe('навантаження на базу', () => {
		it('усі вісім запитів ідуть одним пакетом', async () => {
			const gate = deferred<void>();
			let started = 0;

			const pending = (value: unknown) =>
				vi.fn(() => {
					started += 1;
					return gate.promise.then(() => value);
				});

			db.orderAggregate.mockImplementation(pending({ _sum: { total: 0 }, _count: { _all: 0 } }));
			db.itemAggregate.mockImplementation(pending({ _sum: { quantity: 0 } }));
			db.orderGroupBy.mockImplementation(pending([]));
			db.queryRaw.mockImplementation(pending([]));
			db.variantFindMany.mockImplementation(pending([]));

			const result = open('MANAGER');
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(started).toBe(8);

			gate.resolve();
			await result;
		});

		it('дні групує Postgres, а не Node', async () => {
			await open('MANAGER');

			// Два $queryRaw: ряд по днях і топ товарів. Обидва повертають
			// уже згруповане — тисячі рядків у застосунок не їдуть.
			expect(db.queryRaw).toHaveBeenCalledTimes(2);
		});

		it('залишки бере обмеженою вибіркою', async () => {
			await open('MANAGER');
			expect(db.variantFindMany.mock.calls[0][0]).toMatchObject({ take: 6 });
		});
	});

	describe('період з адреси', () => {
		it('сміття у параметрі дає місяць за замовчуванням', async () => {
			const data = await open('MANAGER', '?period=99999');
			expect(data.period).toBe('30');
			expect(data.days).toBe(PERIOD_DAYS['30']);
		});

		it('кожен відомий період дає рівно стільки точок, скільки днів', async () => {
			for (const period of PERIODS) {
				const data = await open('MANAGER', `?period=${period}`);
				const days = PERIOD_DAYS[period];

				expect(data.days).toBe(days);
				expect(data.series).toHaveLength(Math.ceil(days / data.bucket));
			}
		});

		it('рік показує тижнями, коротші періоди — днями', async () => {
			expect((await open('MANAGER', '?period=365')).bucket).toBe(7);
			expect((await open('MANAGER', '?period=90')).bucket).toBe(1);
		});
	});

	describe('підрахунки', () => {
		it('порожня база не дає NaN і ділення на нуль', async () => {
			const data = await open('MANAGER');

			expect(data.metrics.revenue.value).toBe(0);
			expect(data.metrics.average.value).toBe(0);
			expect(data.metrics.revenue.delta).toBeNull();
			expect(data.series.every((point) => point.revenue === 0)).toBe(true);
		});

		it('середній чек рахується з виручки й кількості замовлень', async () => {
			db.orderAggregate
				.mockResolvedValueOnce({ _sum: { total: 100000 }, _count: { _all: 4 } })
				.mockResolvedValueOnce({ _sum: { total: 50000 }, _count: { _all: 2 } });

			const data = await open('MANAGER');

			expect(data.metrics.average.value).toBe(25000);
			// Виручка подвоїлась відносно попереднього періоду.
			expect(data.metrics.revenue.delta).toBe(100);
		});

		it('дні без замовлень стають нулями, а не зникають із графіка', async () => {
			const today = new Date();
			const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(today);
			db.queryRaw.mockResolvedValueOnce([{ day: key, revenue: 1200, orders: 2 }]);

			const data = await open('MANAGER', '?period=7');

			expect(data.series).toHaveLength(7);
			expect(data.series.at(-1)).toMatchObject({ revenue: 1200, orders: 2 });
			expect(data.series.slice(0, 6).every((point) => point.revenue === 0)).toBe(true);
		});
	});
});
