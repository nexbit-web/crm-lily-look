import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';

type Resolve = (event: unknown) => Promise<Response>;
type Handle = (input: { event: unknown; resolve: Resolve }) => Promise<Response>;

const { getSession, svelteKitHandler } = vi.hoisted(() => ({
	getSession: vi.fn(),
	// Справжній обробник better-auth тут ні до чого: перевіряємо власну
	// перевірку доступу, а не чужу бібліотеку.
	svelteKitHandler: vi.fn(({ event, resolve }: { event: unknown; resolve: Resolve }) =>
		resolve(event)
	)
}));

vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('better-auth/svelte-kit', () => ({ svelteKitHandler }));

const { invalidate } = vi.hoisted(() => ({ invalidate: vi.fn(async () => {}) }));
vi.mock('$lib/server/cache', async (original) => ({
	...(await original<typeof import('$lib/server/cache')>()),
	invalidate
}));

// Позначка «сесію перечитати з бази» (зміна ролі, видалення співробітника).
const { isSessionStale } = vi.hoisted(() => ({ isSessionStale: vi.fn(async () => false) }));
vi.mock('$lib/server/sessions', () => ({ isSessionStale }));

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
	const hook = handle as unknown as Handle;
	return { ctx, result: hook({ event: ctx.event, resolve: ctx.resolve }) };
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

	it('без сесії API (пошук) дає 401, а не HTML сторінки входу', async () => {
		const { result } = run('/api/search?q=пальто');

		await expect(result).rejects.toSatisfy(isHttpError);
		await result.catch((err: { status: number }) => expect(err.status).toBe(401));
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

describe('кеш після змін', () => {
	beforeEach(() => {
		invalidate.mockClear();
		getSession.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' }, session: { id: 's1' } });
	});

	it('збереження в розділі скидає його кеш', async () => {
		await run('/discounts?/save', 'POST').result;
		expect(invalidate).toHaveBeenCalledWith('discounts', 'products');
	});

	it('кеш скинуто ще до відповіді — наступний перегляд уже свіжий', async () => {
		let resolved = false;
		invalidate.mockImplementationOnce(async () => {
			expect(resolved).toBe(false);
		});
		await run('/orders?/status', 'POST').result.then(() => (resolved = true));
		expect(invalidate).toHaveBeenCalledWith('orders');
	});

	it('звичайний перегляд кеш не чіпає', async () => {
		await run('/products').result;
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('запис без сесії до кешу не доходить', async () => {
		getSession.mockResolvedValue(null);
		await run('/products/abc?/delete', 'POST').result.catch(() => {});
		expect(invalidate).not.toHaveBeenCalled();
	});
});

/**
 * Cookie-кеш сесії (5 хв) береже базу, але памʼятає стару роль. Співробітник,
 * якого щойно видалили чи понизили, має втратити доступ одразу.
 */
describe('зміна ролі й видалення діють одразу', () => {
	const fromCookie = { user: { id: 'u2', role: 'ADMIN' }, session: { id: 's2' } };

	beforeEach(() => {
		getSession.mockReset();
		isSessionStale.mockReset().mockResolvedValue(false);
	});

	it('звичайний співробітник — сесія з cookie, без другого запиту', async () => {
		getSession.mockResolvedValue(fromCookie);

		await run('/orders').result;

		expect(getSession).toHaveBeenCalledTimes(1);
		expect(isSessionStale).toHaveBeenCalledWith('u2');
	});

	it('пониженому — сесія з бази, і сторінки бачать уже нову роль', async () => {
		isSessionStale.mockResolvedValue(true);
		getSession
			.mockResolvedValueOnce(fromCookie)
			.mockResolvedValueOnce({ user: { id: 'u2', role: 'OPERATOR' }, session: { id: 's2' } });

		const { ctx, result } = run('/statistics');
		await result;

		expect(getSession).toHaveBeenCalledTimes(2);
		expect(getSession.mock.calls[1][0]).toMatchObject({ query: { disableCookieCache: true } });
		expect(ctx.locals.user).toMatchObject({ role: 'OPERATOR' });
	});

	it('видаленого — одразу на сторінку входу, хоч cookie ще жива', async () => {
		isSessionStale.mockResolvedValue(true);
		getSession.mockResolvedValueOnce(fromCookie).mockResolvedValueOnce(null);

		const { ctx, result } = run('/orders');

		await expect(result).rejects.toSatisfy(isRedirect);
		expect(ctx.resolve).not.toHaveBeenCalled();
	});

	it('без сесії позначку навіть не перевіряє', async () => {
		getSession.mockResolvedValue(null);

		await run('/login').result;

		expect(isSessionStale).not.toHaveBeenCalled();
	});
});

describe('заголовки відповіді', () => {
	beforeEach(() => {
		getSession.mockReset().mockResolvedValue(fromSession());
		isSessionStale.mockReset().mockResolvedValue(false);
	});

	function fromSession() {
		return { user: { id: 'u1', role: 'ADMIN' }, session: { id: 's1' } };
	}

	it('CRM не індексується, не вбудовується в чужі сторінки й не світить адреси', async () => {
		const response = await run('/orders?q=0501234567').result;

		expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
		expect(response.headers.get('X-Frame-Options')).toBe('DENY');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
	});

	it('сторінка входу теж із заголовками', async () => {
		getSession.mockResolvedValue(null);
		const response = await run('/login').result;

		expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
	});

	it('незмінні заголовки не ламають відповідь', async () => {
		const ctx = request('/api/search?q=x');
		const frozen = new Response('[]');
		Object.defineProperty(frozen, 'headers', {
			value: {
				set() {
					throw new TypeError('immutable');
				}
			}
		});
		ctx.resolve.mockResolvedValue(frozen);

		const hook = handle as unknown as Handle;
		await expect(hook({ event: ctx.event, resolve: ctx.resolve })).resolves.toBe(frozen);
	});
});
