import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from './helpers/deferred';

const db = vi.hoisted(() => ({
	findMany: vi.fn(),
	groupBy: vi.fn(),
	count: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	prisma: { order: { findMany: db.findMany, groupBy: db.groupBy, count: db.count } }
}));

vi.mock('$lib/server/prisma-client/client', () => ({ Prisma: {} }));

const { load } = await import('../src/routes/(app)/orders/+page.server');

type Result = {
	page: number;
	pageCount: number;
	total: number;
	status: string | null;
	counts: Record<string, number>;
};

function open(search = '') {
	return (load as unknown as (e: { url: URL }) => Promise<Result>)({
		url: new URL(`http://localhost/orders${search}`)
	});
}

function empty(total = 0) {
	db.groupBy.mockResolvedValue([]);
	db.count.mockResolvedValue(total);
	db.findMany.mockResolvedValue([]);
}

describe('список замовлень', () => {
	beforeEach(() => {
		for (const mock of Object.values(db)) mock.mockReset();
		empty();
	});

	describe('навантаження на базу', () => {
		it('лічильники, підсумок і сама сторінка йдуть одним пакетом', async () => {
			const gate = deferred<void>();
			let started = 0;

			const pending = (value: unknown) =>
				vi.fn(() => {
					started += 1;
					return gate.promise.then(() => value);
				});

			db.groupBy.mockImplementation(pending([]));
			db.count.mockImplementation(pending(0));
			db.findMany.mockImplementation(pending([]));

			const result = open();
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(started).toBe(3);

			gate.resolve();
			await result;
		});

		it('сторінку в межах діапазону не перезапитує', async () => {
			empty(40);
			await open('?page=2');

			expect(db.findMany).toHaveBeenCalledTimes(1);
			expect(db.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20 });
		});

		it('сторінка за межами діапазону повертає останню наявну', async () => {
			empty(10);
			const data = await open('?page=99');

			expect(data.page).toBe(1);
			expect(db.findMany).toHaveBeenCalledTimes(2);
			expect(db.findMany.mock.calls[1][0].skip).toBe(0);
		});

		it('позиції замовлення приходять разом із карткою, без другого запиту', async () => {
			await open();

			// Розгортання картки на сторінці нічого не довантажує.
			expect(db.findMany.mock.calls[0][0].select.items.select.productName).toBe(true);
		});

		it('службові колонки в браузер не їдуть', async () => {
			await open();

			const { select } = db.findMany.mock.calls[0][0];
			for (const hidden of ['paymentProvider', 'paymentRef', 'updatedAt']) {
				expect(select[hidden]).toBeUndefined();
			}
			expect(select.items.select.variantId).toBeUndefined();
		});
	});

	describe('параметри з адреси', () => {
		it('невідомий статус ігнорується', async () => {
			const data = await open('?status=DROP+TABLE');

			expect(data.status).toBeNull();
			expect(db.findMany.mock.calls[0][0].where.status).toBeUndefined();
		});

		it('відомий статус потрапляє у фільтр', async () => {
			const data = await open('?status=NEW');

			expect(data.status).toBe('NEW');
			expect(db.findMany.mock.calls[0][0].where.status).toBe('NEW');
		});

		it('пошук іде за номером, імʼям і телефоном', async () => {
			await open('?q=0671234567');

			expect(db.findMany.mock.calls[0][0].where.OR).toHaveLength(3);
		});

		it('лічильники в чипсах не залежать від вибраного статусу', async () => {
			await open('?status=NEW');

			expect(db.groupBy.mock.calls[0][0].where.status).toBeUndefined();
		});

		it('сміття в номері сторінки не ламає вибірку', async () => {
			for (const page of ['abc', '-5', '0', '']) {
				db.findMany.mockClear();
				await open(`?page=${page}`);
				expect(db.findMany.mock.calls[0][0].skip).toBe(0);
			}
		});
	});

	it('рахує підсумок по всіх статусах', async () => {
		db.groupBy.mockResolvedValue([
			{ status: 'NEW', _count: { _all: 2 } },
			{ status: 'DONE', _count: { _all: 5 } }
		]);
		db.count.mockResolvedValue(7);

		const data = await open();

		expect(data.counts.ALL).toBe(7);
		expect(data.counts.NEW).toBe(2);
	});
});
