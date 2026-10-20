import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
	findMany: vi.fn(async () => []),
	groupBy: vi.fn(async () => []),
	count: vi.fn(async () => 0),
	findUnique: vi.fn(),
	update: vi.fn()
}));
const steps = vi.hoisted(() => [] as string[]);
const cache = vi.hoisted(() => ({
	cached: vi.fn(async (_key: string, _options: unknown, load: () => Promise<unknown>) => load()),
	invalidate: vi.fn(async (...tags: string[]) => {
		steps.push(`invalidate:${tags.join(',')}`);
	})
}));
const pusher = vi.hoisted(() => ({
	trigger: vi.fn(async (_channel: string, name: string) => {
		steps.push(`trigger:${name}`);
		return true;
	})
}));

vi.mock('$lib/server/db', () => ({ prisma: { order: db } }));
vi.mock('$lib/server/prisma-client/client', () => ({ Prisma: {} }));
vi.mock('$lib/server/cache', () => cache);
vi.mock('$lib/server/pusher', () => pusher);

const { load, actions } = await import('../src/routes/(app)/orders/+page.server');

function open(search = '') {
	return (load as unknown as (e: unknown) => Promise<{ query: string; perPage: number }>)({
		url: new URL(`http://localhost/orders${search}`),
		depends: () => {}
	});
}

function submit(name: 'status' | 'payment', fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = new Request(`http://localhost/orders?/${name}`, { method: 'POST', body });
	return (actions[name] as unknown as (e: unknown) => Promise<unknown>)({ request });
}

beforeEach(() => {
	steps.length = 0;
	cache.cached.mockClear();
	cache.invalidate.mockClear();
	pusher.trigger.mockClear();
	db.findUnique.mockReset().mockResolvedValue({ paymentStatus: 'UNPAID' });
	db.update.mockReset().mockResolvedValue({ id: 'o1' });
});

describe('замовлення з кешу', () => {
	it('список береться з Redis на пів хвилини й скидається тегом замовлень', async () => {
		await open();

		const [key, options] = cache.cached.mock.calls[0];
		expect(key).toMatch(/^orders:list:/);
		expect(options).toEqual({ tags: ['orders'], ttl: 30 });
	});

	it('кожен фільтр, сторінка й пошук — окремий запис кешу', async () => {
		const keys = new Set<string>();
		for (const search of [
			'',
			'?status=NEW',
			'?status=NEW&page=2',
			'?prize=1',
			'?q=Олена',
			'?q=олена',
			'?status=SHIPPED&prize=1&q=050&page=3'
		]) {
			cache.cached.mockClear();
			await open(search);
			keys.add(cache.cached.mock.calls[0][0]);
		}

		expect(keys.size).toBe(7);
	});

	it('сміття в адресі не плодить записів кешу', async () => {
		await open('?status=HACK&page=abc');
		await open('');

		const [first, second] = cache.cached.mock.calls.map(([key]) => key);
		expect(first).toBe(second);
	});

	it('у кеш іде лише вибірка — параметри адреси додаються вже після', async () => {
		const data = await open('?q=%20Олена%20');

		expect(data.query).toBe('Олена');
		expect(data.perPage).toBe(20);
		const stored = await cache.cached.mock.results[0].value;
		expect(Object.keys(stored as object).sort()).toEqual(
			['counts', 'orders', 'page', 'pageCount', 'prizeCount', 'total'].sort()
		);
	});
});

describe('зміна замовлення в CRM', () => {
	it('статус: спершу кеш скинуто, потім подія іншим вкладкам — вони читають уже нове', async () => {
		await submit('status', { id: 'o1', status: 'CONFIRMED' });

		expect(steps).toEqual(['invalidate:orders', 'trigger:order.updated']);
	});

	it('оплата — так само', async () => {
		await submit('payment', { id: 'o1', paymentStatus: 'PAID' });

		expect(steps).toEqual(['invalidate:orders', 'trigger:order.updated']);
	});

	it('відмова (невідомий статус) нічого не скидає й нікого не будить', async () => {
		await submit('status', { id: 'o1', status: 'LOST' });

		expect(steps).toEqual([]);
	});
});
