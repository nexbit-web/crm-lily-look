import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authOptions } from '../src/lib/server/auth-options';

vi.mock('$lib/server/db', () => ({ prisma: {} }));

type Command = (string | number)[];

const store = new Map<string, { value: string; ex?: number }>();
const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
	const commands = JSON.parse(init.body) as Command[];
	const replies = commands.map(([name, key, value, , ex]) => {
		if (name === 'SET') {
			store.set(String(key), { value: String(value), ex: Number(ex) });
			return { result: 'OK' };
		}
		return { result: store.get(String(key))?.value ?? null };
	});
	return new Response(JSON.stringify(replies));
});

async function fresh() {
	vi.resetModules();
	return import('$lib/server/sessions');
}

beforeEach(() => {
	store.clear();
	fetchMock.mockClear();
	vi.stubGlobal('fetch', fetchMock);
	vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example');
	vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'secret');
	vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('позначка «сесію перечитати з бази»', () => {
	it('стоїть лише на співробітнику, якого змінили', async () => {
		const { markSessionStale, isSessionStale } = await fresh();

		await markSessionStale('u1');

		expect(await isSessionStale('u1')).toBe(true);
		expect(await isSessionStale('u2')).toBe(false);
	});

	it('живе довше за cookie-кеш сесії — до кінця позначки старий кеш точно мине', async () => {
		const { markSessionStale, SESSION_CACHE_SECONDS } = await fresh();

		await markSessionStale('u1');

		const [entry] = store.values();
		expect(entry.ex).toBeGreaterThan(SESSION_CACHE_SECONDS);
		// І cookie-кеш better-auth налаштований саме на цей строк.
		expect(authOptions.session.cookieCache.maxAge).toBe(SESSION_CACHE_SECONDS);
	});

	it('спільна для всіх збірок — позначка з одного деплою діє в іншому', async () => {
		const { markSessionStale } = await fresh();
		await markSessionStale('u1');

		expect([...store.keys()]).toEqual(['crm:session-stale:u1']);
	});

	it('Redis недоступний — ніхто не вилітає, просто звичайне вікно cookie-кешу', async () => {
		fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
		const { isSessionStale } = await fresh();

		expect(await isSessionStale('u1')).toBe(false);
	});

	it('без налаштованого Redis — жодного мережевого запиту', async () => {
		vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
		const { markSessionStale, isSessionStale } = await fresh();

		await markSessionStale('u1');
		expect(await isSessionStale('u1')).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
