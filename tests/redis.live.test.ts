import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import dotenv from 'dotenv';
import type { CacheTag } from '$lib/server/cache';

/**
 * Живий тест: справжній код кешу проти справжнього Redis із .env.
 *
 *   npm run test:redis
 *
 * У звичайному `npm test` пропускається — там мережі немає. Чіпає лише власні
 * ключі з випадковою назвою й прибирає їх за собою; теги справжніх розділів
 * не скидає, тож кеш робочої CRM не страждає. У базу не ходить зовсім.
 */
const live = import.meta.env.MODE === 'live';
if (live) dotenv.config({ quiet: true });

const run = crypto.randomUUID().slice(0, 8);
/** Тег, якого немає в CRM: скидання тут не зачепить справжніх розділів. */
const TAG = `live-test-${run}` as CacheTag;
const OTHER = `live-test-other-${run}` as CacheTag;
const created: string[] = [`crm:tag:${TAG}`, `crm:tag:${OTHER}`];

const cache = () => import('$lib/server/cache');
const raw = async (commands: (string | number)[][]) => {
	const { redis } = await import('$lib/server/redis');
	const replies = await redis(commands);
	if (!replies)
		throw new Error('Redis не відповів — перевірте UPSTASH_REDIS_REST_URL/TOKEN у .env');
	return replies;
};
const key = (name: string) => {
	created.push(`crm:test:${name}`);
	return name;
};

describe.runIf(live)('Redis (живий)', () => {
	beforeAll(() => {
		expect(
			process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
			'немає адреси Redis у .env'
		).toBeTruthy();
	});

	afterAll(async () => {
		await raw([['DEL', ...created]]);
		const left = await raw(created.map((name) => ['EXISTS', name]));
		expect(left.every((count) => count === 0)).toBe(true);
	});

	it('відповідає, і швидко', async () => {
		await raw([['PING']]);
		const times: number[] = [];
		for (let i = 0; i < 5; i++) {
			const started = performance.now();
			expect(await raw([['PING']])).toEqual(['PONG']);
			times.push(performance.now() - started);
		}
		times.sort((a, b) => a - b);
		console.info(`Redis: медіана ${times[2].toFixed(0)} мс на запит (звідси, не з Vercel)`);
		expect(times[2]).toBeLessThan(1000);
	});

	it('другий перегляд — з Redis: база (load) викликається один раз', async () => {
		const { cached } = await cache();
		const load = vi.fn(async () => ({ at: new Date('2026-10-20T12:00:00Z'), list: [1, 2, 3] }));
		const name = key(`live:${run}:hit`);

		const first = await cached(name, { tags: [TAG], ttl: 60 }, load);
		const second = await cached(name, { tags: [TAG], ttl: 60 }, load);

		expect(load).toHaveBeenCalledTimes(1);
		expect(second).toEqual(first);
		expect(second.at).toBeInstanceOf(Date);
	});

	it('запис живе рівно стільки, скільки задано', async () => {
		const { cached } = await cache();
		const name = key(`live:${run}:ttl`);
		await cached(name, { tags: [TAG], ttl: 45 }, async () => 1);

		const [ttl] = await raw([['TTL', `crm:test:${name}`]]);
		expect(ttl).toBeGreaterThan(40);
		expect(ttl).toBeLessThanOrEqual(45);
	});

	it('скидання тегу — наступний перегляд іде в базу, чужий тег не зачеплено', async () => {
		const { cached, invalidate } = await cache();
		const mine = vi.fn(async () => 'моє');
		const other = vi.fn(async () => 'чуже');
		const a = key(`live:${run}:a`);
		const b = key(`live:${run}:b`);

		await cached(a, { tags: [TAG], ttl: 60 }, mine);
		await cached(b, { tags: [OTHER], ttl: 60 }, other);
		await invalidate(TAG);
		await cached(a, { tags: [TAG], ttl: 60 }, mine);
		await cached(b, { tags: [OTHER], ttl: 60 }, other);

		expect(mine).toHaveBeenCalledTimes(2);
		expect(other).toHaveBeenCalledTimes(1);
	});

	it('збереження посеред читання з бази — стара версія не показується', async () => {
		const { cached, invalidate } = await cache();
		const name = key(`live:${run}:race`);
		let release!: (value: string) => void;

		const reading = cached(
			name,
			{ tags: [TAG], ttl: 60 },
			() => new Promise<string>((done) => (release = done))
		);
		await vi.waitFor(() => expect(release).toBeTypeOf('function'));
		await invalidate(TAG);
		release('до збереження');
		await reading;

		const load = vi.fn(async () => 'після збереження');
		expect(await cached(name, { tags: [TAG], ttl: 60 }, load)).toBe('після збереження');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('позначка сесії ставиться на 5½ хвилин і читається', async () => {
		const { markSessionStale, isSessionStale, SESSION_CACHE_SECONDS } =
			await import('$lib/server/sessions');
		const user = `live-test-${run}`;
		created.push(`crm:session-stale:${user}`);

		expect(await isSessionStale(user)).toBe(false);
		await markSessionStale(user);
		expect(await isSessionStale(user)).toBe(true);

		const [ttl] = await raw([['TTL', `crm:session-stale:${user}`]]);
		expect(ttl).toBeGreaterThan(SESSION_CACHE_SECONDS);
	});

	it('робочий кеш CRM здоровий: у кожного запису є строк життя', async () => {
		const keys: string[] = [];
		let cursor = '0';
		do {
			const [reply] = await raw([['SCAN', cursor, 'MATCH', 'crm:*', 'COUNT', 500]]);
			const [next, batch] = reply as [string, string[]];
			cursor = next;
			keys.push(...batch);
		} while (cursor !== '0');

		const ttls = keys.length ? await raw(keys.map((name) => ['TTL', name])) : [];
		// Без строку можуть жити лише мітки тегів (crm:tag:*): їх пʼять, і вони крихітні.
		const forever = keys.filter(
			(name, index) => ttls[index] === -1 && !name.startsWith('crm:tag:')
		);
		console.info(`Redis: ${keys.length} ключів CRM`);
		expect(forever).toEqual([]);
	});
});
