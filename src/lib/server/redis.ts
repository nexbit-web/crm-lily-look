/**
 * Redis (Upstash, REST по HTTP — працює на серверлесі без постійних зʼєднань).
 *
 * Спільний клієнт для кешу сторінок ($lib/server/cache) і позначок сесій
 * ($lib/server/sessions). Redis — лише прискорювач: не налаштований чи не
 * відповідає — усе працює напряму з базою.
 */

/** Redis, що не відповів за цей час, гірший за похід у базу. */
const TIMEOUT_MS = 1500;
/** Після збою якийсь час не пробуємо — щоб не платити таймаут на кожному запиті. */
const COOLDOWN_MS = 30_000;

let downUntil = 0;

function config(): { url: string; token: string } | null {
	// Upstash напряму або через Vercel Marketplace (там змінні звуться KV_*).
	const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
	const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
	return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

export type Command = (string | number)[];

/**
 * Кілька команд одним HTTP-запитом. Відповідь — по одній на команду (null,
 * якщо саме ця команда не вдалась). null замість масиву — Redis недоступний.
 */
export async function redis(commands: Command[]): Promise<unknown[] | null> {
	const settings = config();
	if (!settings || commands.length === 0 || Date.now() < downUntil) return null;

	try {
		const response = await fetch(`${settings.url}/pipeline`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${settings.token}` },
			body: JSON.stringify(commands),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if (!response.ok) throw new Error(`Redis ${response.status}`);

		const replies = (await response.json()) as { result?: unknown; error?: string }[];
		return replies.map((reply) => (reply.error ? null : (reply.result ?? null)));
	} catch (err) {
		downUntil = Date.now() + COOLDOWN_MS;
		console.warn('[redis] недоступний, працюємо напряму з базою:', String(err));
		return null;
	}
}
