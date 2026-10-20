import type { Component } from 'svelte';
import {
	BadgePercent,
	Bot,
	ChartNoAxesColumn,
	Eye,
	FolderTree,
	Package,
	Settings,
	ShieldUser,
	Shirt
} from '@lucide/svelte';
import { atLeast, type Role } from '$lib/permissions';
import type { NavGlyph } from '$lib/components/sidebar/nav-icon.svelte';

/**
 * Розділи CRM — одним списком для сайдбару й пошуку (Ctrl K).
 *
 * `short` — підпис під іконкою в сайдбарі, англійською: колонка вузька, як у
 * ClickUp, а англійські слова коротші. `glyph` — власна іконка розділу. `min` — найнижча роль, якій розділ видно.
 */
export type NavItem = {
	href: string;
	label: string;
	short: string;
	glyph: NavGlyph;
	/** Іконка Lucide — для рядків у пошуку. */
	icon: Component;
	min?: Role;
	/** Додаткові слова для пошуку: «трафік» має знаходити відвідуваність. */
	keywords?: string;
	/** Службовий розділ самої CRM (не продажі й не сайт) — у сайдбарі внизу. */
	system?: boolean;
};

export const NAV: NavItem[] = [
	{ href: '/orders', label: 'Замовлення', short: 'Orders', glyph: 'orders', icon: Package },
	{
		href: '/products',
		label: 'Товари',
		short: 'Items',
		glyph: 'products',
		icon: Shirt,
		keywords: 'каталог'
	},
	{
		href: '/categories',
		label: 'Категорії',
		short: 'Catalog',
		glyph: 'categories',
		icon: FolderTree
	},
	{
		href: '/statistics',
		label: 'Статистика',
		short: 'Stats',
		glyph: 'stats',
		icon: ChartNoAxesColumn,
		min: 'ADMIN',
		keywords: 'виручка продажі'
	},
	{
		href: '/traffic',
		label: 'Відвідуваність',
		short: 'Traffic',
		glyph: 'traffic',
		icon: Eye,
		min: 'MANAGER',
		keywords: 'трафік джерела воронка колесо'
	},
	{
		href: '/discounts',
		label: 'Знижки',
		short: 'Promo',
		glyph: 'discounts',
		icon: BadgePercent,
		min: 'MANAGER'
	},
	{
		href: '/admins',
		label: 'Співробітники',
		short: 'Team',
		glyph: 'team',
		icon: ShieldUser,
		min: 'ADMIN',
		keywords: 'адміни користувачі доступ',
		system: true
	},
	{
		href: '/telegram',
		label: 'Telegram Bot',
		short: 'Bot',
		glyph: 'bot',
		icon: Bot,
		min: 'ADMIN',
		keywords: 'телеграм',
		system: true
	}
];

export const SETTINGS: NavItem = {
	href: '/settings',
	label: 'Налаштування',
	short: 'Settings',
	glyph: 'settings',
	icon: Settings,
	keywords: 'тема вихід'
};

/** Розділи, які бачить ця роль. */
export function navFor(role: string | null | undefined): NavItem[] {
	return NAV.filter((item) => atLeast(role, item.min ?? 'OPERATOR'));
}

/** Чи відкритий зараз цей розділ (разом із його підсторінками). */
export function isActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(href + '/');
}
