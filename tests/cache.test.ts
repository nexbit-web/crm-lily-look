import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'devalue';
import { deferred } from './helpers/deferred';

const request = vi.hoisted(() => ({ method: 'GET' as string | null }));

// Поточний запит: GET — звичайний перегляд, POST — form action.
vi.mock('$app/server', () => ({
	getRequestEvent: () => {
		if (!request.method) throw new Error('поза запитом');
		return { request: { method: request.method } };
	}
}));

type Command = (string | number)[];

/**
 * Підроблений Upstash: виконує ті самі команди, що й справжній (GET, SET з EX,
 * MGET, DEL), і памʼятає кожен HTTP-запит — щоб рахувати подорожі до Redis.
 */
function fakeRedis() {
	const store = new Map<string, string>();
	const ttl = new Map<string, number>();
	const calls: Command[][] = [];

	const fetchMock = vi.fn(async (_url: string, init: { body: string; signal?: AbortSignal }) => {
		const commands = JSON.parse(init.body) as Command[];
		calls.push(commands);
		const replies = commands.map(([name, ...args]) => {
			const [key] = args as string[];
			switch (name) {
				case 'GET':
					return { result: store.get(key) ?? null };
				case 'MGET':
					return { result: (args as string[]).map((item) => store.get(item) ?? null) };
				case 'SET':
					store.set(key, String(args[1]));
					if (args[2] === 'EX') ttl.set(key, Number(args[3]));
					return { result: 'OK' };
				case 'DEL':
					for (const item of args as string[]) store.delete(item);
					return { result: args.length };
				default:
					return { error: `ERR unknown command '${name}'` };
			}
		});
		return new Response(JSON.stringify(replies));
	});

	return { store, ttl, calls, fetchMock };
}

async function fresh() {
	vi.resetModules();
	return import('$lib/server/cache');
}

let redis: ReturnType<typeof fakeRedis>;

beforeEach(() => {
	request.method = 'GET';
	redis = fakeRedis();
	vi.stubGlobal('fetch', redis.fetchMock);
	vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
	vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'secret');
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('кеш: менше запитів до бази', () => {
	it('другий перегляд береться з Redis — база не чіпається', async () => {
		const { cached } = await fresh();
		const load = vi.fn(async () => ({ count: 7 }));

		expect(await cached('orders:new', { tags: ['orders'], ttl: 30 }, load)).toEqual({ count: 7 });
		expect(await cached('orders:new', { tags: ['orders'], ttl: 30 }, load)).toEqual({ count: 7 });

		expect(load).toHaveBeenCalledTimes(1);
	});

	it('влучання — один HTTP-запит: сам запис і мітки його тегів разом', async () => {
		const { cached } = await fresh();
		await cached('k', { tags: ['products', 'categories'], ttl: 60 }, async () => 1);
		redis.calls.length = 0;

		await cached('k', { tags: ['products', 'categories'], ttl: 60 }, async () => 2);

		expect(redis.calls).toEqual([
			[
				['GET', 'crm:test:k'],
				['MGET', 'crm:tag:products', 'crm:tag:categories']
			]
		]);
	});

	it('промах — ще один запит: запис зі строком життя', async () => {
		const { cached } = await fresh();
		await cached('products:list', { tags: ['products'], ttl: 300 }, async () => 1);

		expect(redis.fetchMock).toHaveBeenCalledTimes(2);
		const [[set]] = redis.calls.slice(1);
		expect(set.slice(0, 2)).toEqual(['SET', 'crm:test:products:list']);
		expect(set.slice(3)).toEqual(['EX', 300]);
		expect(redis.ttl.get('crm:test:products:list')).toBe(300);
	});

	it('дати й вкладені обʼєкти повертаються такими ж, як були', async () => {
		const { cached } = await fresh();
		const value = { at: new Date('2026-10-19T10:00:00Z'), items: [{ id: 'a', price: null }] };

		await cached('x', { tags: ['orders'], ttl: 60 }, async () => value);
		const again = await cached(
			'x',
			{ tags: ['orders'], ttl: 60 },
			async () => ({}) as typeof value
		);

		expect(again.at).toBeInstanceOf(Date);
		expect(again).toEqual(value);
	});

	it('версія збірки в ключі запису: після деплою старі дані не читаються', async () => {
		const { cached } = await fresh();
		await cached('k', { tags: ['orders'], ttl: 60 }, async () => 1);

		expect([...redis.store.keys()]).toEqual(['crm:test:k']);
	});

	it('поза запитом (скрипти) кеш працює як для перегляду', async () => {
		request.method = null;
		const { cached } = await fresh();
		const load = vi.fn(async () => 1);

		await cached('k', { tags: ['orders'], ttl: 60 }, load);
		await cached('k', { tags: ['orders'], ttl: 60 }, load);
		expect(load).toHaveBeenCalledTimes(1);
	});
});

describe('кеш: свіжі дані після змін', () => {
	it('скидання тегу — наступний перегляд його записів іде в базу, чужі лишаються', async () => {
		const { cached, invalidate } = await fresh();
		const products = vi.fn(async () => 'товари');
		const orders = vi.fn(async () => 3);

		await cached('products:list:1', { tags: ['products'], ttl: 300 }, products);
		await cached('products:list:2', { tags: ['products'], ttl: 300 }, products);
		await cached('orders:new', { tags: ['orders'], ttl: 30 }, orders);

		await invalidate('products');

		await cached('products:list:1', { tags: ['products'], ttl: 300 }, products);
		await cached('products:list:2', { tags: ['products'], ttl: 300 }, products);
		await cached('orders:new', { tags: ['orders'], ttl: 30 }, orders);
		expect(products).toHaveBeenCalledTimes(4);
		expect(orders).toHaveBeenCalledTimes(1);
	});

	it('запис із кількома тегами скидається будь-яким із них', async () => {
		const { cached, invalidate } = await fresh();
		const load = vi.fn(async () => 'дерево');

		await cached('categories:tree', { tags: ['categories', 'products'], ttl: 86_400 }, load);
		await invalidate('products');
		await cached('categories:tree', { tags: ['categories', 'products'], ttl: 86_400 }, load);

		expect(load).toHaveBeenCalledTimes(2);
	});

	it('скидання — один HTTP-запит, без пошуку ключів розділу', async () => {
		const { invalidate } = await fresh();

		await invalidate('categories', 'products');

		expect(redis.calls).toHaveLength(1);
		const [commands] = redis.calls;
		expect(commands.map(([name, key]) => [name, key])).toEqual([
			['SET', 'crm:tag:categories'],
			['SET', 'crm:tag:products']
		]);
	});

	it('мітки тегів спільні для всіх збірок — зміна в будь-якій скидає кеш скрізь', async () => {
		const { invalidate } = await fresh();
		await invalidate('orders');

		expect([...redis.store.keys()]).toEqual(['crm:tag:orders']);
		expect(redis.ttl.has('crm:tag:orders')).toBe(false);
	});

	it('зберегли, поки інший запит читав з бази, — стара версія в кеші не показується', async () => {
		const { cached, invalidate } = await fresh();
		const slow = deferred<string>();

		// Перегляд почав читати базу ще до збереження…
		const reading = cached('products:list', { tags: ['products'], ttl: 300 }, () => slow.promise);
		await vi.waitFor(() => expect(redis.calls).toHaveLength(1));
		// …збереження пройшло й скинуло кеш…
		await invalidate('products');
		// …а потім перегляд дочитав стару версію й поклав її в кеш.
		slow.resolve('до збереження');
		expect(await reading).toBe('до збереження');

		const load = vi.fn(async () => 'після збереження');
		expect(await cached('products:list', { tags: ['products'], ttl: 300 }, load)).toBe(
			'після збереження'
		);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('у form action дані беруться з бази, і Redis не чіпається зовсім', async () => {
		const { cached } = await fresh();
		await cached('k', { tags: ['products'], ttl: 60 }, async () => 'старе');
		redis.calls.length = 0;

		request.method = 'POST';
		expect(await cached('k', { tags: ['products'], ttl: 60 }, async () => 'нове')).toBe('нове');
		// Хук однаково скине теги розділу одразу після відповіді — писати марно.
		expect(redis.calls).toEqual([]);
	});

	it('які розділи скидає запис на кожну адресу', async () => {
		const { tagsForWrite } = await fresh();

		expect(tagsForWrite('/products/abc')).toEqual(['products']);
		expect(tagsForWrite('/products/new')).toEqual(['products']);
		// Назва категорії й знижка видно в списку товарів — скидаємо й його.
		expect(tagsForWrite('/categories')).toEqual(['categories', 'products']);
		expect(tagsForWrite('/discounts')).toEqual(['discounts', 'products']);
		expect(tagsForWrite('/orders')).toEqual(['orders']);
		expect(tagsForWrite('/traffic/refresh')).toEqual(['traffic']);
		expect(tagsForWrite('/admins')).toEqual([]);
		expect(tagsForWrite('/api/auth/sign-in/email')).toEqual([]);
	});
});

describe('кеш: надійність', () => {
	it('без налаштувань Redis — просто база, без жодного мережевого запиту', async () => {
		vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
		const { cached, invalidate } = await fresh();
		const load = vi.fn(async () => 1);

		await cached('k', { tags: ['orders'], ttl: 60 }, load);
		await cached('k', { tags: ['orders'], ttl: 60 }, load);
		await invalidate('orders');

		expect(load).toHaveBeenCalledTimes(2);
		expect(redis.fetchMock).not.toHaveBeenCalled();
	});

	it('змінні з Vercel Marketplace (KV_*) теж підходять', async () => {
		vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
		vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
		vi.stubEnv('KV_REST_API_URL', 'https://kv.example/');
		vi.stubEnv('KV_REST_API_TOKEN', 'kv');
		const { cached } = await fresh();

		await cached('k', { tags: ['orders'], ttl: 60 }, async () => 1);
		expect(redis.fetchMock.mock.calls[0][0]).toBe('https://kv.example/pipeline');
	});

	it('Redis упав — сторінка однаково відкривається з бази', async () => {
		redis.fetchMock.mockRejectedValue(new Error('ECONNRESET'));
		const { cached } = await fresh();

		expect(await cached('k', { tags: ['orders'], ttl: 60 }, async () => 'з бази')).toBe('з бази');
	});

	it('після збою Redis пів хвилини не смикаємо — без таймауту на кожному запиті', async () => {
		redis.fetchMock.mockRejectedValueOnce(new Error('timeout'));
		const { cached } = await fresh();

		await cached('a', { tags: ['orders'], ttl: 60 }, async () => 1);
		await cached('b', { tags: ['orders'], ttl: 60 }, async () => 2);

		expect(redis.fetchMock).toHaveBeenCalledTimes(1);
	});

	it('скидання, що не дійшло до Redis, досилається з першим же запитом після збою', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const { cached, invalidate } = await fresh();
		const load = vi.fn(async () => 'дані');
		await cached('k', { tags: ['products'], ttl: 300 }, load);

		redis.fetchMock.mockRejectedValueOnce(new Error('timeout'));
		await invalidate('products');
		vi.advanceTimersByTime(31_000);

		// Без досилання тут був би запис, старший за збережені зміни.
		await cached('k', { tags: ['products'], ttl: 300 }, load);
		expect(load).toHaveBeenCalledTimes(2);
		expect(redis.calls.at(-2)?.[0]).toEqual(['SET', 'crm:tag:products', expect.any(String)]);

		// Дослано один раз — далі звичайне влучання.
		await cached('k', { tags: ['products'], ttl: 300 }, load);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('відповідь Redis з помилкою — не кеш, а похід у базу', async () => {
		redis.fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
		const { cached } = await fresh();
		const load = vi.fn(async () => 1);

		expect(await cached('k', { tags: ['orders'], ttl: 60 }, load)).toBe(1);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('мітки тегів не прочитались — дані з бази й у кеш не кладуться', async () => {
		const { cached } = await fresh();
		redis.fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify([{ result: null }, { error: 'ERR' }]))
		);

		expect(await cached('k', { tags: ['orders'], ttl: 60 }, async () => 'з бази')).toBe('з бази');
		expect(redis.fetchMock).toHaveBeenCalledTimes(1);
	});

	it('зіпсований чи старого формату запис у кеші не ламає сторінку', async () => {
		const { cached } = await fresh();

		redis.store.set('crm:test:a', '{not devalue');
		expect(await cached('a', { tags: ['orders'], ttl: 60 }, async () => 'з бази')).toBe('з бази');

		redis.store.set('crm:test:b', '[1]');
		expect(await cached('b', { tags: ['orders'], ttl: 60 }, async () => 'з бази')).toBe('з бази');
	});

	it('значення, яке не серіалізується, віддається без кешу, а не ламає сторінку', async () => {
		const { cached } = await fresh();
		class Decimal {
			constructor(readonly value: string) {}
		}
		const value = { percent: new Decimal('33.5') };

		expect(await cached('k', { tags: ['discounts'], ttl: 60 }, async () => value)).toBe(value);
		expect(redis.store.has('crm:test:k')).toBe(false);
	});

	it('у кеші лежать дані разом із мітками, з якими їх прочитали', async () => {
		const { cached } = await fresh();
		await cached('k', { tags: ['orders'], ttl: 60 }, async () => ({ n: 1 }));

		expect(parse(redis.store.get('crm:test:k') as string)).toEqual({
			stamps: [null],
			value: { n: 1 }
		});
	});

	it('кожен запит до Redis має таймаут', async () => {
		const { cached } = await fresh();
		await cached('k', { tags: ['orders'], ttl: 60 }, async () => 1);

		expect(redis.fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});

	it('токен іде в заголовку, а не в адресі', async () => {
		const { cached } = await fresh();
		await cached('k', { tags: ['orders'], ttl: 60 }, async () => 1);

		const [url, init] = redis.fetchMock.mock.calls[0] as unknown as [
			string,
			{ headers: Record<string, string> }
		];
		expect(url).not.toContain('secret');
		expect(init.headers.Authorization).toBe('Bearer secret');
	});
});
