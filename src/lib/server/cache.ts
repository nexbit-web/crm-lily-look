import { parse, stringify } from 'devalue';
import { version } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { redis, type Command } from './redis';

/**
 * Кеш сторінок у Redis.
 *
 * Навіщо: Neon на безкоштовному тарифі засинає без запитів і прокидається
 * повільно, а CRM здебільшого показує те саме по кілька разів — список
 * товарів, категорії, підказки, статистику.
 *
 * Правила:
 * - Redis не налаштований або не відповідає — йдемо в базу, як без кешу.
 *   Кеш ніколи не ламає CRM, лише прискорює.
 * - Запис у CRM (будь-який не-GET) скидає теги свого розділу — див.
 *   hooks.server.ts. Тому після «Зберегти» на екрані завжди свіже.
 * - Базу змінюють і сайт (замовлення, залишки), і бот (статуси). Про це CRM не
 *   дізнається, тож такі дані живуть недовго — TTL у місці виклику.
 * - Версія збірки в ключі запису: після деплою старі дані іншої форми не
 *   читаються.
 * - Значення серіалізуємо devalue (як сам SvelteKit) — Date, Map, undefined
 *   повертаються такими ж, як були.
 *
 * Як працює скидання. У кожного тегу в Redis лежить мітка — випадковий рядок.
 * Запис кешу памʼятає мітки своїх тегів на момент, коли його читали з бази;
 * скидання тегу просто ставить нову мітку. Запис зі старою міткою — промах.
 *
 * Так скидання — одна команда, а не пошук усіх ключів розділу. І головне:
 * якщо хтось зберіг зміни, поки інший запит ще читав стару версію з бази,
 * ця стара версія ляже в кеш уже з простроченою міткою й ніколи не покажеться.
 *
 * Мітки спільні для всіх збірок (і для локальної розробки на тій самій
 * базі): зміна, зроблена будь-де, скидає кеш скрізь.
 */

export type CacheTag = 'products' | 'categories' | 'discounts' | 'orders' | 'traffic';

const PREFIX = `crm:${version}`;

const tagKey = (tag: CacheTag) => `crm:tag:${tag}`;

/** Що лежить у Redis: дані й мітки тегів, з якими їх прочитали. */
type Entry<T> = { stamps: unknown[]; value: T };

/** Скидання, які не дійшли до Redis (він не відповідав), — дошлемо з наступним запитом. */
const unsent = new Set<CacheTag>();

/** Нова мітка для тегів — усе, що закешовано зі старою, стає промахом. */
function bump(tags: Iterable<CacheTag>): Command[] {
	const stamp = crypto.randomUUID();
	return [...tags].map((tag) => ['SET', tagKey(tag), stamp]);
}

const sameStamps = (a: unknown[], b: unknown[]) =>
	a.length === b.length && a.every((stamp, index) => stamp === b[index]);

/** Запит-запис (form action, API): тут потрібні дані з бази, а не з кешу. */
function isWrite(): boolean {
	try {
		return getRequestEvent().request.method !== 'GET';
	} catch {
		return false; // поза запитом (скрипти, тести)
	}
}

export type CacheOptions = {
	/** Розділи, від яких залежать дані: зміна будь-якого з них скидає запис. */
	tags: [CacheTag, ...CacheTag[]];
	/** Скільки секунд запис живе, навіть якщо ніхто нічого не міняв. */
	ttl: number;
};

/**
 * Дані з кешу, а якщо їх немає — з бази (і одразу в кеш).
 *
 * `key` має однозначно описувати дані: усе, від чого залежить результат
 * (параметри адреси, дата «сьогодні»), мусить бути в ключі.
 */
export async function cached<T>(
	key: string,
	{ tags, ttl }: CacheOptions,
	load: () => Promise<T>
): Promise<T> {
	// Запис: дані потрібні прямо з бази. У Redis теж нічого не кладемо —
	// одразу після відповіді хук однаково скине теги цього розділу.
	if (isWrite()) return load();

	const fullKey = `${PREFIX}:${key}`;
	const resend = [...unsent];

	// Один HTTP-запит: недоіслані скидання, сам запис і поточні мітки тегів.
	const replies = await redis([...bump(resend), ['GET', fullKey], ['MGET', ...tags.map(tagKey)]]);
	if (!replies) return load();
	for (const tag of resend) unsent.delete(tag);

	const [hit, stamps] = replies.slice(resend.length);
	// Не знаємо поточних міток — не знаємо, чи свіжий запис. Краще в базу.
	if (!Array.isArray(stamps)) return load();

	if (typeof hit === 'string') {
		try {
			const entry = parse(hit) as Entry<T>;
			if (Array.isArray(entry?.stamps) && sameStamps(entry.stamps, stamps)) return entry.value;
		} catch {
			// Зіпсований запис — просто перечитуємо з бази.
		}
	}

	const value = await load();

	let payload: string;
	try {
		payload = stringify({ stamps, value } satisfies Entry<T>);
	} catch (err) {
		// Значення, яке devalue не вміє (Decimal, клас) — віддаємо без кешу,
		// а не ламаємо сторінку. Виправляти — у місці виклику.
		console.warn(`[cache] «${key}» не кешується:`, String(err));
		return value;
	}

	await redis([['SET', fullKey, payload, 'EX', ttl]]);
	return value;
}

/** Скидає все, що залежить від цих розділів. */
export async function invalidate(...tags: CacheTag[]): Promise<void> {
	const all = new Set([...unsent, ...tags]);
	if (all.size === 0) return;

	const replies = await redis(bump(all));
	// Redis не відповів — запамʼятовуємо: інакше після його повернення на
	// екрані були б дані, старші за збережені.
	if (replies) unsent.clear();
	else for (const tag of all) unsent.add(tag);
}

/** Які розділи кешу змінює запис на цю адресу. */
export function tagsForWrite(pathname: string): CacheTag[] {
	// Ціна в списку товарів залежить і від знижок, і від категорій (назва),
	// тому зміна будь-чого з них скидає й товари.
	if (pathname.startsWith('/products')) return ['products'];
	if (pathname.startsWith('/categories')) return ['categories', 'products'];
	if (pathname.startsWith('/discounts')) return ['discounts', 'products'];
	if (pathname.startsWith('/orders')) return ['orders'];
	if (pathname.startsWith('/traffic')) return ['traffic'];
	return [];
}
