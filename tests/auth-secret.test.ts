import { afterEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ building: false }));
vi.mock('$app/environment', () => ({
	get building() {
		return env.building;
	}
}));

const { authSecret } = await import('$lib/server/auth-secret');

afterEach(() => {
	env.building = false;
	vi.unstubAllEnvs();
});

describe('секрет better-auth', () => {
	it('під час роботи — лише справжній BETTER_AUTH_SECRET', () => {
		vi.stubEnv('BETTER_AUTH_SECRET', 'real-secret');
		expect(authSecret()).toBe('real-secret');
	});

	it('під час роботи без секрету — нічого: better-auth відмовиться стартувати, а не візьме відомий ключ', () => {
		vi.stubEnv('BETTER_AUTH_SECRET', '');
		expect(authSecret()).toBeUndefined();
	});

	it('збірка без змінних не падає — їй секрет не потрібен', () => {
		vi.stubEnv('BETTER_AUTH_SECRET', '');
		env.building = true;
		expect(authSecret()).toBeTruthy();
	});

	it('якщо секрет є, збірка теж бере його, а не заглушку', () => {
		vi.stubEnv('BETTER_AUTH_SECRET', 'real-secret');
		env.building = true;
		expect(authSecret()).toBe('real-secret');
	});
});
