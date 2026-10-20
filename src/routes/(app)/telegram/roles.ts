import { Crown, ShieldCheck, Truck } from '@lucide/svelte';
import type { BotRoleKey } from '$lib/bot';

/** Плашка ролі бота: адміністратор — фіолетовий, менеджер — синій, курʼєр — бурштиновий. */
export const BOT_ROLE_BADGES: Record<BotRoleKey, string> = {
	ADMIN: 'bg-violet-500 text-white',
	MANAGER: 'bg-sky-500 text-white',
	COURIER: 'bg-amber-500 text-white'
};

export const BOT_ROLE_ICONS: Record<BotRoleKey, typeof Crown> = {
	ADMIN: Crown,
	MANAGER: ShieldCheck,
	COURIER: Truck
};

export function initials(name: string): string {
	return name.trim().slice(0, 2).toUpperCase();
}
