<!-- src/lib/components/sidebar/Sidebar.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import type { Component } from 'svelte';
	import {
		LayoutDashboard,
		Package,
		Shirt,
		FolderTree,
		BadgePercent,
		ShieldUser,
		Settings
	} from '@lucide/svelte';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { atLeast, type Role } from '$lib/permissions';

	let {
		user,
		newOrders = 0
	}: {
		user: { role: string };
		newOrders?: number;
	} = $props();

	// min — мінімальна роль, щоб бачити пункт. Без min → видно всім staff.
	type NavItem = { href: string; label: string; icon: Component; min?: Role };

	const nav: NavItem[] = [
		{
			href: '/statistics',
			label: 'Статистика',
			icon: LayoutDashboard,
			min: 'MANAGER'
		},
		{ href: '/orders', label: 'Замовлення', icon: Package },
		{ href: '/products', label: 'Товари', icon: Shirt },
		{ href: '/categories', label: 'Категорії', icon: FolderTree },
		{ href: '/discounts', label: 'Знижки', icon: BadgePercent, min: 'MANAGER' },
		{ href: '/admins', label: 'Адмін', icon: ShieldUser, min: 'ADMIN' }
	];
	// Видимі пункти за роллю користувача
	const visibleNav = $derived(nav.filter((i) => atLeast(user.role, i.min ?? 'OPERATOR')));

	// Стоїть окремо, притиснутий до низу: там же тема і вихід з акаунта.
	const settingsItem: NavItem = { href: '/settings', label: 'Налаштування', icon: Settings };

	const pathname = $derived(page.url.pathname);

	function isActive(href: string): boolean {
		if (href === '/') return pathname === '/';
		return pathname === href || pathname.startsWith(href + '/');
	}
</script>

{#snippet navLink(item: NavItem)}
	{@const active = isActive(item.href)}
	{@const badge = item.href === '/orders' ? newOrders : 0}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<!-- Вибраний пункт — мʼяка заливка плюс синя іконка, як вибраний
				     рядок у бічних панелях macOS. Ніякої підсвітки: у списку з
				     шести іконок достатньо кольору, щоб побачити, де ти є. -->
				<a
					{...props}
					href={item.href}
					aria-current={active ? 'page' : undefined}
					aria-label={badge > 0 ? `${item.label} — ${badge} нових` : item.label}
					class="relative flex h-10 w-full items-center justify-center rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/40 {active
						? 'bg-white/10 text-primary'
						: 'text-white/55 hover:bg-white/6 hover:text-white/90'}"
				>
					<item.icon size={20} strokeWidth={active ? 2.1 : 1.8} aria-hidden="true" />
					{#if badge > 0}
						<span
							class="absolute top-1.5 right-1.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-[#0f0f12] dark:ring-card"
							aria-hidden="true"
						>
							{badge > 9 ? '9+' : badge}
						</span>
					{/if}
				</a>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="right">
			<p>
				{item.label}{#if badge > 0}&nbsp;({badge}){/if}
			</p>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Tooltip.Provider delayDuration={200}>
	<nav
		aria-label="Навігація CRM"
		class="flex h-full w-14 shrink-0 flex-col items-center rounded-2xl border border-border bg-[#0f0f12] py-3 dark:bg-card"
	>
		<div class="flex w-full flex-col items-center gap-1 px-1.5">
			{#each visibleNav as item (item.href)}
				{@render navLink(item)}
			{/each}
		</div>

		<div class="mt-auto flex w-full flex-col items-center px-1.5">
			{@render navLink(settingsItem)}
		</div>
	</nav>
</Tooltip.Provider>
