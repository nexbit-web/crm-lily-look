import type { Role } from '$lib/permissions';

export const ROLE_LABELS: Record<Role, string> = {
	OPERATOR: 'Оператор',
	MANAGER: 'Менеджер',
	ADMIN: 'Адміністратор'
};

/** Що бачить роль — так само, як відкриває сайдбар (min у $lib/nav). */
export const ROLE_HINTS: Record<Role, string> = {
	OPERATOR: 'Замовлення, товари й категорії.',
	MANAGER: 'Плюс знижки й відвідуваність сайту.',
	ADMIN: 'Усе, зокрема статистика, співробітники й Telegram Bot.'
};

/** Плашка ролі в таблиці: адміністратор — фіолетовий, менеджер — синій. */
export const ROLE_BADGES: Record<Role, string> = {
	ADMIN: 'bg-violet-500 text-white',
	MANAGER: 'bg-sky-500 text-white',
	OPERATOR: 'bg-foreground/10 text-foreground/80'
};

/**
 * Пароль не треба вигадувати — і не треба вигадувати погано. Алфавіт без
 * схожих символів (0/O, 1/l/I), щоб його можна було продиктувати.
 */
export function newPassword(): string {
	const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const numbers = crypto.getRandomValues(new Uint32Array(16));
	return Array.from(numbers, (value) => alphabet[value % alphabet.length]).join('');
}
