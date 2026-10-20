import { describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

/** База, яку не можна чіпати: будь-яке звернення — провал тесту. */
const touched = vi.hoisted(() => ({ count: 0 }));
vi.mock('$lib/server/db', () => {
	const trap: object = new Proxy(() => {}, {
		get: () => {
			touched.count += 1;
			return trap;
		},
		apply: () => {
			touched.count += 1;
			return Promise.reject(new Error('база не мала відкриватись'));
		}
	});
	return { prisma: trap };
});
vi.mock('$lib/server/prisma-client/client', () => ({ Prisma: {} }));
// Окремий інстанс better-auth для нових акаунтів тут ні до чого.
vi.mock('$lib/server/staff', () => ({ createStaffAccount: vi.fn() }));

/**
 * Перше відкриття сторінки віддає дані стрімом (скелетон одразу). Перевірка
 * ролі мусить спрацювати ДО стріму: інакше замість 403 користувач побачив би
 * скелетон, а запит до бази однаково пішов би.
 */
const PAGES = {
	'/statistics': () => import('../src/routes/(app)/statistics/+page.server'),
	'/traffic': () => import('../src/routes/(app)/traffic/+page.server'),
	'/discounts': () => import('../src/routes/(app)/discounts/+page.server'),
	'/admins': () => import('../src/routes/(app)/admins/+page.server'),
	'/telegram': () => import('../src/routes/(app)/telegram/+page.server')
};

function firstOpen(path: string, role: string) {
	const url = new URL(`http://localhost${path}`);
	return {
		url,
		params: {},
		isDataRequest: false,
		locals: { user: { id: 'u1', role } },
		depends: () => {},
		setHeaders: () => {},
		parent: async () => ({})
	};
}

describe('перевірка доступу — до стріму даних', () => {
	for (const [path, page] of Object.entries(PAGES)) {
		it(`${path}: оператор отримує 403 одразу, а база не відкривається`, async () => {
			touched.count = 0;
			const { load } = await page();

			await expect(
				(load as unknown as (e: unknown) => Promise<unknown>)(firstOpen(path, 'OPERATOR'))
			).rejects.toSatisfy((err) => isHttpError(err) && err.status === 403);
			expect(touched.count).toBe(0);
		});
	}
});
