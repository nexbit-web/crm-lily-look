<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import toast from '$lib/toast.svelte';
	import { mode, toggleMode } from 'mode-watcher';
	import {
		ChevronDown,
		ExternalLink,
		Inbox,
		LogOut,
		Moon,
		Search,
		Settings,
		Sun
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { signOut } from '$lib/auth-client';
	import { streaming } from '$lib/loading.svelte';

	/**
	 * Шапка в стилі ClickUp: лежить на сірому полотні над сайдбаром і панеллю.
	 * Зліва — «робочий простір», по центру — пошук (Ctrl K), справа — нові
	 * замовлення, тема й профіль.
	 */
	let {
		user,
		newOrders = 0,
		onsearch
	}: {
		user: { name: string; email: string; role: string };
		newOrders?: number;
		onsearch: () => void;
	} = $props();

	const ROLE_LABELS: Record<string, string> = {
		ADMIN: 'Адміністратор',
		MANAGER: 'Менеджер',
		OPERATOR: 'Оператор'
	};

	/** «Олена Коваль» → «ОК»; без імені — перша літера пошти. */
	const initials = $derived(
		(
			user.name
				.split(/\s+/)
				.filter(Boolean)
				.slice(0, 2)
				.map((word) => word[0])
				.join('') || user.email[0]
		).toUpperCase()
	);

	// На Mac підказка — ⌘K, на решті — Ctrl K. До монтування не знаємо платформи.
	let shortcut = $state('Ctrl K');
	/**
	 * Сайт ще вантажиться: скрипти не підхопили сторінку або дані першого
	 * відкриття ще йдуть стрімом. Тоді фон «LILY LOOK» і пошуку — біжучий
	 * скелетон, а текст лишається на місці.
	 */
	let hydrated = $state(false);
	const loading = $derived(!hydrated || streaming.pending > 0);
	onMount(() => {
		hydrated = true;
		if (/Mac|iPhone|iPad/.test(navigator.userAgent)) shortcut = '⌘K';
	});

	async function logout() {
		const { error } = await signOut();
		if (error) {
			toast.error(error.message ?? 'Не вдалося вийти');
			return;
		}
		await invalidateAll();
		await goto('/login');
	}

	const iconButton =
		'relative flex size-7 items-center justify-center rounded-[10px] text-[#8d8d8d] transition-colors hover:bg-[#8d8d8d]/10 hover:text-foreground dark:text-[#b4b4b4] dark:hover:bg-accent';
</script>

<!-- Шапка — рівно 40 px від самого верху вікна, без відступів згори й знизу.
     Усередині контейнер 32 px: усі елементи шапки вирівняні по ньому. -->
<header class="flex h-10 shrink-0 items-center px-1.5">
	<div class="grid h-8 w-full grid-cols-[1fr_minmax(0,250px)_1fr] items-center gap-1.5">
		<!-- Робочий простір -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						class="flex h-7 w-fit min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 transition-colors {loading
							? 'skeleton'
							: 'bg-foreground/6 hover:bg-foreground/10'}"
					>
						<span
							class="flex size-4.5 shrink-0 items-center justify-center rounded-[5px] bg-[#16a37c] text-[10px] font-bold text-white"
						>
							L
						</span>
						<span class="truncate text-[13px] font-medium tracking-[-0.01em]">LILY LOOK</span>
						<ChevronDown size={13} class="shrink-0 text-[#8d8d8d]" />
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-56">
				<DropdownMenu.Label class="text-xs font-normal text-muted-foreground"
					>CRM магазину</DropdownMenu.Label
				>
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href="https://lilylook.store" target="_blank" rel="noopener noreferrer">
							<ExternalLink size={15} />
							Відкрити сайт
						</a>
					{/snippet}
				</DropdownMenu.Item>
				<DropdownMenu.Item onSelect={() => goto('/settings')}>
					<Settings size={15} />
					Налаштування
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<!-- Пошук: сам рядок вводу живе в модалці, тут лише кнопка, що її відкриває. -->
		<button
			type="button"
			class="flex h-7 w-full items-center gap-1.5 rounded-full border px-[7px] text-[13px] text-muted-foreground transition-colors {loading
				? 'skeleton border-transparent'
				: 'border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-foreground/20 hover:text-foreground dark:border-transparent dark:bg-accent dark:shadow-none dark:hover:border-transparent'}"
			onclick={onsearch}
			aria-keyshortcuts="Control+K Meta+K"
		>
			<Search size={16} class="shrink-0" />
			<span class="truncate">Пошук</span>
			<kbd
				class="-mr-0.5 ml-auto hidden h-5 shrink-0 items-center rounded-full border border-border px-2 {loading
					? 'bg-transparent'
					: 'bg-card'} font-sans text-[11px] leading-none font-semibold text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] sm:inline-flex dark:border-transparent dark:bg-transparent dark:px-0.5 dark:text-[#6e6e6e] dark:shadow-none"
			>
				{shortcut}
			</kbd>
		</button>

		<div class="flex items-center justify-end gap-1.5">
			<a
				href="/orders?status=NEW"
				class={iconButton}
				title={newOrders > 0 ? `Нові замовлення: ${newOrders}` : 'Нових замовлень немає'}
				aria-label={newOrders > 0 ? `Нові замовлення: ${newOrders}` : 'Нових замовлень немає'}
			>
				<Inbox size={16} />
				{#if newOrders > 0}
					<span
						class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-shell"
					>
						{newOrders > 9 ? '9+' : newOrders}
					</span>
				{/if}
			</a>

			<button
				type="button"
				class={iconButton}
				onclick={toggleMode}
				title={mode.current === 'dark' ? 'Світла тема' : 'Темна тема'}
				aria-label={mode.current === 'dark' ? 'Увімкнути світлу тему' : 'Увімкнути темну тему'}
			>
				{#if mode.current === 'dark'}<Sun size={16} />{:else}<Moon size={16} />{/if}
			</button>

			<!-- Профіль -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							class="flex items-center gap-1 rounded-[10px] p-0.5 transition-colors hover:bg-foreground/6"
							aria-label="Профіль"
						>
							<span
								class="relative flex size-6 items-center justify-center rounded-full bg-[#fd7e14] text-[10px] font-semibold text-white"
							>
								{initials}
								<span
									class="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-shell"
								></span>
							</span>
							<ChevronDown size={12} class="text-[#8d8d8d]" />
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" class="w-60">
					<div class="px-2 py-1.5">
						<p class="truncate text-sm font-medium">{user.name || user.email}</p>
						<p class="truncate text-xs text-muted-foreground">{user.email}</p>
						<p class="mt-1 text-xs text-muted-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
					</div>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onSelect={() => goto('/settings')}>
						<Settings size={15} />
						Налаштування
					</DropdownMenu.Item>
					<DropdownMenu.Item variant="destructive" onSelect={logout}>
						<LogOut size={15} />
						Вийти
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
</header>
