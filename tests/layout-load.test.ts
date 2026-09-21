import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const { orderCount } = vi.hoisted(() => ({ orderCount: vi.fn() }));
vi.mock('$lib/server/db', () => ({ prisma: { order: { count: orderCount } } }));

const { load } = await import('../src/routes/(app)/+layout.server');

type Result = { user: Record<string, unknown>; newOrders: number };

const user = {
	id: 'u1',
	name: 'Ніка',
	email: 'nika@example.com',
	role: 'MANAGER',
	emailVerified: true,
	image: null,
	createdAt: new Date(),
	updatedAt: new Date()
};

/**
 * `url` віддаємо через Proxy: SvelteKit саме так і стежить, чого торкнувся
 * load, і будь-яке звернення тут означало б перезапуск на кожному переході.
 */
function open(locals: { user: unknown }) {
	const touched: string[] = [];
	const url = new Proxy(new URL('http://localhost/products?page=2'), {
		get(target, prop, receiver) {
			touched.push(String(prop));
			return Reflect.get(target, prop, receiver);
		}
	});

	const result = (load as unknown as (e: unknown) => Promise<Result>)({ locals, url });
	return { touched, result };
}

describe('спільні дані CRM', () => {
	beforeEach(() => {
		orderCount.mockReset();
		orderCount.mockResolvedValue(3);
	});

	it('не читає url — інакше запит повторювався б на кожному переході', async () => {
		// Найдорожче тут не сам COUNT, а те, скільки разів він виконується:
		// load, що торкнувся адреси, SvelteKit перезапускає на кожній навігації.
		const { touched, result } = open({ user });
		await result;

		expect(touched).toEqual([]);
	});

	it('робить рівно один запит на лічильник', async () => {
		await open({ user }).result;

		expect(orderCount).toHaveBeenCalledTimes(1);
		expect(orderCount).toHaveBeenCalledWith({ where: { status: 'NEW' } });
	});

	it('віддає в браузер лише потрібні поля співробітника', async () => {
		const data = await open({ user }).result;

		expect(Object.keys(data.user).sort()).toEqual(['email', 'id', 'name', 'role']);
		expect(data.newOrders).toBe(3);
	});

	it('без сесії — на сторінку входу, без звернення до бази', async () => {
		const { result } = open({ user: null });

		await expect(result).rejects.toSatisfy(isRedirect);
		expect(orderCount).not.toHaveBeenCalled();
	});
});
