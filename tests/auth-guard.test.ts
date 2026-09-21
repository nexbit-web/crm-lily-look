import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';

const { getSession, svelteKitHandler } = vi.hoisted(() => ({
	getSession: vi.fn(),
	svelteKitHandler: vi.fn(async ({ event, resolve }: { event: unknown; resolve: Function }) =>
		resolve(event)
	)
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('better-auth/svelte-kit', () => ({ svelteKitHandler }));

const { handle } = await import('../src/hooks.server');

type Locals = { user: unknown; session: unknown };

function request(path: string, method = 'GET') {
	const url = new URL(`http://localhost${path}`);
	const locals = {} as Locals;
	const event = { url, locals, request: new Request(url, { method }) };
	const resolve = vi.fn(async () => new Response('ok'));

	return { event, resolve, locals };
}

function run(path: string, method = 'GET') {
	const ctx = request(path, method);
	// Хук типізований під SvelteKit; у тесті достатньо тих полів, які він читає.
	return { ctx, result: (handle as unknown as Function)({ event: ctx.event, resolve: ctx.resolve }) };
}

/**
 * Безпека. Це єдине місце, де закривається весь CRM, тому перевіряємо його
 * окремо від сторінок: помилка тут відкриває доступ до всього одразу.
 */
describe('захист маршрутів', () => {
	beforeEach(() => {
		getSession.mockReset();
		getSession.mockResolvedValue(null);
	});

	it('без сесії GET відправляє на вхід і памʼятає, куди йшли', async () => {
		const { result } = run('/products?page=2&sort=name');

		await expect(result).rejects.toSatisfy(isRedirect);
		await result.catch((err: { status: number; location: string }) => {
			expect(err.status).toBe(303);
			expect(err.location).toBe('/login?redirectTo=%2Fproducts%3Fpage%3D2%26sort%3Dname');
		});
	});

	it('без сесії POST дає 401, а не редірект', async () => {
		// form actions виконуються без load-функцій: редірект тут виглядав би
		// для браузера як успішна відповідь, і форма «мовчки» не зберіглась би.
		const { result } = run('/products/new', 'POST');

		await expect(result).rejects.toSatisfy(isHttpError);
		await result.catch((err: { status: number }) => expect(err.status).toBe(401));
	});

	it('закриває й службові адреси, не лише сторінки', async () => {
		for (const path of ['/api/uploads/sign', '/api/uploads/delete']) {
			const { result } = run(path, 'POST');
			await expect(result).rejects.toSatisfy(isHttpError);
		}
	});

	it('сторінка входу та ендпоінти better-auth лишаються відкритими', async () => {
		for (const path of ['/login', '/api/auth/sign-in/email', '/api/auth/get-session']) {
			const { ctx, result } = run(path, 'POST');
			await result;
			expect(ctx.resolve).toHaveBeenCalled();
		}
	});

	it('відкритим є саме /login, а не все, що з нього починається', async () => {
		const { result } = run('/login-as-admin');
		await expect(result).rejects.toSatisfy(isRedirect);
	});

	it('із сесією кладе користувача в locals і пропускає далі', async () => {
		getSession.mockResolvedValue({
			user: { id: 'u1', role: 'MANAGER' },
			session: { id: 's1' }
		});

		const { ctx, result } = run('/products');
		await result;

		expect(ctx.locals.user).toMatchObject({ id: 'u1', role: 'MANAGER' });
		expect(ctx.locals.session).toMatchObject({ id: 's1' });
		expect(ctx.resolve).toHaveBeenCalled();
	});

	it('сесію читає один раз на запит', async () => {
		getSession.mockResolvedValue({ user: { id: 'u1' }, session: { id: 's1' } });

		await run('/products').result;

		expect(getSession).toHaveBeenCalledTimes(1);
	});
});
