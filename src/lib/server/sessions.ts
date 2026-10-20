import { redis } from './redis';

/**
 * Сесія з cookie-кешу better-auth живе до 5 хвилин без звернення до бази.
 * Це й економить базу — і заважає: видалений співробітник ще 5 хвилин
 * ходив би CRM, а понижений — бачив би сторінки старої ролі.
 *
 * Тому зміна ролі чи видалення ставить у Redis позначку на той самий час,
 * скільки живе cookie-кеш. Поки позначка є, сесію цього співробітника
 * перечитуємо з бази (hooks.server.ts) — і доступ змінюється з наступного
 * ж запиту. Решта співробітників нічого не помічає.
 *
 * Redis недоступний — позначки не видно, і лишається звичайне вікно
 * cookie-кешу. CRM при цьому не ламається.
 */

/** Скільки живе cookie-кеш сесії (див. authOptions.session.cookieCache). */
export const SESSION_CACHE_SECONDS = 60 * 5;

/** Трохи довше за cookie-кеш: до кінця позначки старий кеш точно мине. */
const STALE_SECONDS = SESSION_CACHE_SECONDS + 30;

const staleKey = (userId: string) => `crm:session-stale:${userId}`;

/** Роль чи акаунт співробітника змінились — його сесію читаємо з бази. */
export async function markSessionStale(userId: string): Promise<void> {
	await redis([['SET', staleKey(userId), '1', 'EX', STALE_SECONDS]]);
}

/** Чи треба перечитати сесію цього співробітника з бази. */
export async function isSessionStale(userId: string): Promise<boolean> {
	const [value] = (await redis([['GET', staleKey(userId)]])) ?? [];
	return value !== null && value !== undefined;
}
