/**
 * Довідник для сторінки Telegram-бота.
 *
 * Бот живе на хостингу сайту й спілкується з CRM тільки через базу: ніяких
 * HTTP-викликів між ними немає. Тут — те, що однаково потрібне серверу й
 * браузеру: назви ролей і правила, за якими рахується стан на екрані.
 */

/** Ролі в боті. Це не ролі CRM (`$lib/permissions`) — набори різні. */
export const BOT_ROLES = ['MANAGER', 'COURIER', 'ADMIN'] as const;

export type BotRoleKey = (typeof BOT_ROLES)[number];

export function isBotRole(value: unknown): value is BotRoleKey {
	return typeof value === 'string' && (BOT_ROLES as readonly string[]).includes(value);
}

export const BOT_ROLE_LABELS: Record<BotRoleKey, string> = {
	MANAGER: 'Менеджер',
	COURIER: 'Курʼєр',
	ADMIN: 'Адміністратор'
};

/** Один рядок на роль — більше на екрані не потрібно. */
export const BOT_ROLE_HINTS: Record<BotRoleKey, string> = {
	MANAGER: 'Весь маршрут замовлення',
	COURIER: 'Тільки «Отримано»',
	ADMIN: 'Усе, плюс видача кодів у боті'
};

/**
 * Стан коду на екрані.
 *
 * `usedAt` заповнює бот у момент входу; CRM пише туди тільки коли відкликає
 * ще не виданий код — тоді в списку лишається слід, а не порожнє місце.
 */
export type InviteState = 'waiting' | 'used' | 'expired';

export function inviteState(
	invite: { usedAt: Date | string | null; expiresAt: Date | string | null },
	now: Date = new Date()
): InviteState {
	if (invite.usedAt) return 'used';
	if (invite.expiresAt && new Date(invite.expiresAt) < now) return 'expired';
	return 'waiting';
}

/**
 * Стан доступу.
 *
 * Бот пускає, коли `isActive` і `leftAt IS NULL` — обидві умови разом. Саме
 * тому «вийшов сам» показуємо окремо: там мало ввімкнути isActive.
 */
export type AccessState = 'active' | 'revoked' | 'left';

export function accessState(user: {
	isActive: boolean;
	leftAt: Date | string | null;
}): AccessState {
	if (user.leftAt) return 'left';
	return user.isActive ? 'active' : 'revoked';
}

/** Рядок, яку людина надсилає боту. Копіюємо її цілком, а не сам код. */
export function startCommand(code: string): string {
	return `/start ${code}`;
}

/** Скільки днів живе код. Порожній рядок — безстроковий. */
export const INVITE_TERMS = [
	{ value: '1', label: 'Доба' },
	{ value: '7', label: 'Тиждень' },
	{ value: '30', label: 'Місяць' },
	{ value: '', label: 'Безстроково' }
] as const;
