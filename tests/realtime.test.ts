import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
const cache = vi.hoisted(() => ({ invalidate: vi.fn() }));

vi.mock('$lib/server/db', () => ({ prisma: { order: { findUnique: db.findUnique } } }));
vi.mock('$lib/server/cache', () => ({ invalidate: cache.invalidate }));

const { authorizeChannel, signRequest } = await import('../src/lib/server/pusher');
const hook = await import('../src/routes/api/hooks/orders/+server');
const auth = await import('../src/routes/api/pusher/auth/+server');

type Handler = (e: unknown) => Promise<Response>;

const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubEnv('PUSHER_APP_ID', '3');
	vi.stubEnv('PUSHER_KEY', '278d425bdf160c739803');
	vi.stubEnv('PUSHER_SECRET', '7ad3773142a6692b25b8');
	vi.stubEnv('PUSHER_CLUSTER', 'eu');
	vi.stubEnv('CRM_HOOK_SECRET', 'hook-secret');
	vi.stubGlobal('fetch', fetchMock);
	fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
	db.findUnique.mockReset();
	cache.invalidate.mockReset();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

describe('підписи Pusher (приклади з документації)', () => {
	it('підписка на приватний канал', () => {
		expect(authorizeChannel('1234.1234', 'private-foobar')).toEqual({
			auth: '278d425bdf160c739803:58df8b0c36d6982b82c3ecf6b4662e34fe8c25bba48f5369f135bf843651c3a4'
		});
	});

	it('REST-запит події', () => {
		const query = signRequest(
			{ key: '278d425bdf160c739803', secret: '7ad3773142a6692b25b8' },
			'/apps/3/events',
			'{"name":"foo","channels":["project-3"],"data":"{\\"some\\":\\"data\\"}"}',
			1353088179
		);
		expect(query).toBe(
			'auth_key=278d425bdf160c739803&auth_timestamp=1353088179&auth_version=1.0' +
				'&body_md5=ec365a775a4cd0599faeb73354201b6f' +
				'&auth_signature=da454824c97ba181a32ccc17a72625ba02771f50b50e1e7430e47a1f3f457e6c'
		);
	});
});

function callHook(body: unknown, secret: string | null = 'hook-secret') {
	const headers: Record<string, string> = { 'content-type': 'application/json' };
	if (secret !== null) headers.authorization = `Bearer ${secret}`;
	const request = new Request('http://localhost/api/hooks/orders', {
		method: 'POST',
		headers,
		body: JSON.stringify(body)
	});
	return (hook.POST as unknown as Handler)({ request });
}

describe('вебхук «нове замовлення»', () => {
	const order = {
		id: 'o1',
		number: 'LL-2K4F7B',
		customerName: 'Ніка',
		total: 120000,
		_count: { items: 2 }
	};

	it('без секрету чи з чужим — 401, у базу не ходимо', async () => {
		for (const secret of [null, 'wrong', '']) {
			await expect(callHook({ id: 'o1' }, secret)).rejects.toMatchObject({ status: 401 });
		}
		expect(db.findUnique).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('незнайоме замовлення — 404, подію не шлемо', async () => {
		db.findUnique.mockResolvedValue(null);
		await expect(callHook({ id: 'nope' })).rejects.toMatchObject({ status: 404 });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('скидає кеш замовлень і шле подію з даними з бази', async () => {
		db.findUnique.mockResolvedValue(order);
		const response = await callHook({ number: 'LL-2K4F7B', customerName: 'підробка' });

		expect(await response.json()).toEqual({ ok: true, delivered: true });
		expect(db.findUnique.mock.calls[0][0].where).toEqual({ number: 'LL-2K4F7B' });
		expect(cache.invalidate).toHaveBeenCalledWith('orders');

		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toMatch(/^https:\/\/api-eu\.pusher\.com\/apps\/3\/events\?auth_key=/);
		const sent = JSON.parse(init.body);
		expect(sent).toMatchObject({ name: 'order.created', channels: ['private-crm-orders'] });
		expect(JSON.parse(sent.data)).toEqual({
			id: 'o1',
			number: 'LL-2K4F7B',
			customerName: 'Ніка',
			total: 120000,
			items: 2
		});
	});

	it('Pusher не відповів — вебхук однаково 200, просто delivered: false', async () => {
		db.findUnique.mockResolvedValue(order);
		fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
		vi.spyOn(console, 'error').mockImplementation(() => {});

		expect(await (await callHook({ id: 'o1' })).json()).toEqual({ ok: true, delivered: false });
	});
});

describe('підписка браузера на канал', () => {
	function callAuth(channel: string, socketId = '123.456') {
		const body = new URLSearchParams({ socket_id: socketId, channel_name: channel });
		const request = new Request('http://localhost/api/pusher/auth', { method: 'POST', body });
		return (auth.POST as unknown as Handler)({ request });
	}

	it('підписує лише канал замовлень', async () => {
		const response = await callAuth('private-crm-orders');
		expect((await response.json()).auth).toMatch(/^278d425bdf160c739803:[0-9a-f]{64}$/);
	});

	it('інший канал або кривий socket_id — відмова', async () => {
		await expect(callAuth('private-other')).rejects.toSatisfy(isHttpError);
		await expect(callAuth('private-crm-orders', 'abc')).rejects.toSatisfy(isHttpError);
	});
});
