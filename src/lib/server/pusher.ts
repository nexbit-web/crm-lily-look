import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RealtimeConfig } from '$lib/realtime';

/**
 * Pusher Channels через REST — без SDK: потрібні лише дві речі, обидві —
 * HMAC-SHA256 від секрету.
 *
 * - trigger(): надіслати подію в канал;
 * - authorizeChannel(): дозволити браузеру підписатися на приватний канал.
 *
 * Pusher не налаштований (немає змінних у .env) — події просто не йдуть,
 * CRM працює як раніше. Збій Pusher ніколи не ламає збереження.
 */

type Settings = { appId: string; key: string; secret: string; cluster: string };

function settings(): Settings | null {
	const appId = process.env.PUSHER_APP_ID;
	const key = process.env.PUSHER_KEY;
	const secret = process.env.PUSHER_SECRET;
	const cluster = process.env.PUSHER_CLUSTER;
	return appId && key && secret && cluster ? { appId, key, secret, cluster } : null;
}

/** Для браузера: ключ і кластер (секрет лишається на сервері). */
export function realtimeConfig(): RealtimeConfig | null {
	const current = settings();
	return current ? { key: current.key, cluster: current.cluster } : null;
}

const hmac = (secret: string, text: string) =>
	createHmac('sha256', secret).update(text).digest('hex');

/**
 * Підпис REST-запиту за протоколом Pusher: метод, шлях і відсортовані
 * параметри (разом з md5 тіла), підписані секретом.
 */
export function signRequest(
	{ key, secret }: Pick<Settings, 'key' | 'secret'>,
	path: string,
	body: string,
	timestamp: number
): string {
	const params: Record<string, string> = {
		auth_key: key,
		auth_timestamp: String(timestamp),
		auth_version: '1.0',
		body_md5: createHash('md5').update(body).digest('hex')
	};
	const query = Object.keys(params)
		.sort()
		.map((name) => `${name}=${params[name]}`)
		.join('&');
	return `${query}&auth_signature=${hmac(secret, `POST\n${path}\n${query}`)}`;
}

/** Надіслати подію. false — Pusher не налаштований або не відповів. */
export async function trigger(channel: string, event: string, data: unknown): Promise<boolean> {
	const current = settings();
	if (!current) return false;

	const path = `/apps/${current.appId}/events`;
	const body = JSON.stringify({ name: event, channels: [channel], data: JSON.stringify(data) });
	const query = signRequest(current, path, body, Math.floor(Date.now() / 1000));

	try {
		const response = await fetch(`https://api-${current.cluster}.pusher.com${path}?${query}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body,
			signal: AbortSignal.timeout(3000)
		});
		if (!response.ok) {
			console.error('[pusher]', response.status, await response.text());
			return false;
		}
		return true;
	} catch (err) {
		console.error('[pusher]', err);
		return false;
	}
}

/** Відповідь для pusher-js на запит підписки: `{ auth: "key:signature" }`. */
export function authorizeChannel(socketId: string, channel: string): { auth: string } | null {
	const current = settings();
	if (!current) return null;
	return { auth: `${current.key}:${hmac(current.secret, `${socketId}:${channel}`)}` };
}

/** Порівняння секрету без витоку через час відповіді. */
export function sameSecret(given: string, expected: string): boolean {
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}
