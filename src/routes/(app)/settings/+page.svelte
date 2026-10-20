<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import toast from '$lib/toast.svelte';
	import { Bell, Check, LogOut } from '@lucide/svelte';
	import { userPrefersMode, setMode, resetMode } from 'mode-watcher';
	import { ACCENTS, DEFAULT_ACCENT, useAccent } from '$lib/accent';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { badge } from '$lib/table';
	import { toRole } from '$lib/permissions';
	import { ROLE_BADGES, ROLE_LABELS } from '../admins/roles';
	import { signOut } from '$lib/auth-client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// 'system' скидається через resetMode(), решта — через setMode().
	const themes = [
		{ value: 'light', label: 'Світлий' },
		{ value: 'dark', label: 'Темний' },
		{ value: 'system', label: 'Авто' }
	] as const;

	const accent = useAccent();
	const role = $derived(toRole(data.user.role));
	/** Аватар — кольору теми; для типової — графітовий, щоб не зливався з фоном. */
	const avatarColor = $derived.by(() => {
		const item = ACCENTS.find((candidate) => candidate.id === accent.current);
		return item?.swatch ?? item?.color ?? '#595d66';
	});

	/** Колір акценту в мініатюрі: вибраний, а для типового — як у реальній темі. */
	function railColor(dark: boolean): string {
		if (accent.current !== DEFAULT_ACCENT) {
			return ACCENTS.find((item) => item.id === accent.current)?.color ?? '#111111';
		}
		return dark ? '#eeeeee' : '#1f1f1f';
	}

	let signingOut = $state(false);

	/** Дозвіл браузера на системні сповіщення — його знає лише браузер. */
	let notifications = $state<NotificationPermission | 'unsupported' | 'unknown'>('unknown');

	onMount(() => {
		notifications = 'Notification' in window ? Notification.permission : 'unsupported';
	});

	async function enableNotifications() {
		notifications = await Notification.requestPermission();
		if (notifications === 'granted') {
			new Notification('Сповіщення увімкнено', {
				body: 'Нові замовлення зʼявлятимуться тут, навіть коли CRM у фоні.'
			});
		}
	}

	function applyTheme(value: (typeof themes)[number]['value']) {
		if (value === 'system') resetMode();
		else setMode(value);
	}

	async function handleSignOut() {
		signingOut = true;
		const { error } = await signOut();

		if (error) {
			signingOut = false;
			toast.error(error.message ?? 'Не вдалося вийти');
			return;
		}

		await invalidateAll();
		await goto('/login');
	}

	function initials(name: string, email: string): string {
		return (name || email).trim().slice(0, 2).toUpperCase();
	}

	/** Рядок налаштувань як у ClickUp: ліворуч назва й пояснення, праворуч — керування. */
	const row = 'grid gap-x-10 gap-y-3 md:grid-cols-[minmax(0,17rem)_1fr]';
	const title = 'text-[15px] font-semibold tracking-tight';
	const hint = 'mt-0.5 text-[13px] leading-5 text-muted-foreground';
</script>

<svelte:head><title>Налаштування — CRM LILY LOOK</title></svelte:head>

<!-- Мініатюра CRM у світлому чи темному режимі: сайдбар із плитками й панель
     зі «рядками» тексту. -->
{#snippet preview(dark: boolean)}
	{@const rail = railColor(dark)}
	<span class="flex size-full gap-2.5 pt-2.5 pl-2.5 {dark ? 'bg-[#2b2b2b]' : 'bg-[#e6e6e6]'}">
		<span class="flex flex-col gap-1.5 pt-1.5">
			<span class="size-4 rounded-[5px]" style:background={rail}></span>
			<span class="size-4 rounded-[5px] {dark ? 'bg-white/12' : 'bg-black/8'}"></span>
			<span class="size-4 rounded-[5px] {dark ? 'bg-white/12' : 'bg-black/8'}"></span>
		</span>
		<span
			class="flex flex-1 flex-col gap-2 rounded-tl-[10px] p-3 {dark
				? 'bg-[#0d0d0d]'
				: 'bg-[#f8f8f8]'}"
		>
			<span class="flex items-center justify-between">
				<span class="h-1.5 w-6 rounded-full {dark ? 'bg-white/20' : 'bg-black/10'}"></span>
				<span class="size-1.5 rounded-full {dark ? 'bg-white/20' : 'bg-black/10'}"></span>
			</span>
			<span class="flex items-center gap-1.5">
				<span class="h-1.5 w-10 rounded-full {dark ? 'bg-white/20' : 'bg-black/10'}"></span>
				<span class="h-2 w-6 rounded-[3px]" style:background={rail}></span>
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-1.5 rounded-full" style:background={rail}></span>
				<span class="h-1.5 w-10 rounded-full {dark ? 'bg-white/20' : 'bg-black/10'}"></span>
				<span class="h-1.5 w-10 rounded-full {dark ? 'bg-white/20' : 'bg-black/10'}"></span>
			</span>
		</span>
	</span>
{/snippet}

<div class="pb-10">
	<div class="border-b border-border pb-5">
		<h1 class="text-[20px] font-semibold tracking-tight">Налаштування</h1>
		<p class="mt-0.5 text-[13px] text-muted-foreground">
			Як CRM виглядає й повідомляє саме вам. Діє лише в цьому браузері.
		</p>
	</div>

	<!-- Вигляд: колір і режим разом, без лінії між ними — як у ClickUp. -->
	<section class="space-y-8 border-b border-border py-8">
		<div class={row}>
			<div>
				<h2 class={title}>Колір теми</h2>
				<p class={hint}>Колір сайдбару й головних кнопок.</p>
			</div>
			<div class="flex flex-wrap gap-4 p-1.5">
				{#each ACCENTS as item (item.id)}
					{@const selected = accent.current === item.id}
					{@const color = item.swatch ?? item.color}
					<!-- Вибраний — кільце того ж кольору з проміжком, як у ClickUp. -->
					<button
						type="button"
						class="flex size-11 items-center justify-center rounded-[10px] text-white transition-transform hover:scale-105 {selected
							? 'outline-[3px] outline-offset-[5px] outline-solid'
							: ''}"
						style:background={color}
						style:outline-color={color}
						onclick={() => accent.set(item.id)}
						aria-pressed={selected}
						aria-label={item.label}
						title={item.label}
					>
						{#if selected}<Check size={17} strokeWidth={2.75} />{/if}
					</button>
				{/each}
			</div>
		</div>

		<div class={row}>
			<div>
				<h2 class={title}>Режим</h2>
				<p class={hint}>Світлий чи темний — або автоматично, як у системі.</p>
			</div>
			<div class="flex flex-wrap gap-5 p-1">
				{#each themes as item (item.value)}
					{@const selected = userPrefersMode.current === item.value}
					<button
						type="button"
						class="group flex flex-col items-center gap-2.5"
						onclick={() => applyTheme(item.value)}
						aria-pressed={selected}
					>
						<span
							class="relative block h-27.5 w-48 overflow-hidden rounded-[14px] border border-border transition-[outline-color] {selected
								? 'outline-[3px] outline-offset-1 outline-primary outline-solid'
								: 'outline-[3px] outline-offset-1 outline-transparent outline-solid group-hover:outline-foreground/15'}"
						>
							{#if item.value === 'system'}
								{@render preview(false)}
								<span class="absolute inset-0 [clip-path:inset(0_0_0_50%)]">
									{@render preview(true)}
								</span>
							{:else}
								{@render preview(item.value === 'dark')}
							{/if}
						</span>
						<span
							class="text-[13px] {selected
								? 'font-semibold text-foreground'
								: 'text-muted-foreground group-hover:text-foreground'}"
						>
							{item.label}
						</span>
					</button>
				{/each}
			</div>
		</div>
	</section>

	<!-- Сповіщення -->
	<section class="border-b border-border py-8">
		<div class={row}>
			<div>
				<h2 class={title}>Сповіщення</h2>
				<p class={hint}>Нове замовлення — одразу, навіть коли CRM у фоновій вкладці.</p>
			</div>
			<div class="flex flex-wrap items-center gap-3">
				{#if notifications === 'granted'}
					<span class="flex items-center gap-2 text-[13px]">
						<span class="size-2 rounded-full bg-[#34c759]"></span>
						Увімкнено в цьому браузері
					</span>
				{:else if notifications === 'denied'}
					<p class="text-[13px] text-muted-foreground">
						Браузер заблокував сповіщення для CRM. Дозвольте їх у налаштуваннях сайту (значок
						ліворуч від адреси) й оновіть сторінку.
					</p>
				{:else if notifications === 'unsupported'}
					<p class="text-[13px] text-muted-foreground">Цей браузер не показує сповіщень.</p>
				{:else}
					<button
						type="button"
						class="flex h-8 items-center gap-2 rounded-[8px] bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
						onclick={enableNotifications}
					>
						<Bell size={15} />
						Увімкнути сповіщення
					</button>
				{/if}
			</div>
		</div>
	</section>

	<!-- Акаунт і вихід -->
	<section class="space-y-8 py-8">
		<div class={row}>
			<div>
				<h2 class={title}>Акаунт</h2>
				<p class={hint}>Ваш користувач у CRM. Роль змінює адміністратор.</p>
			</div>
			<div class="flex items-center gap-3">
				<span
					class="flex size-11 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white"
					style:background={avatarColor}
				>
					{initials(data.user.name ?? '', data.user.email)}
				</span>
				<div class="min-w-0">
					<p class="truncate text-[14px] font-semibold">{data.user.name}</p>
					<p class="truncate text-[13px] text-muted-foreground">{data.user.email}</p>
				</div>
				<span class="{badge} ml-2 {ROLE_BADGES[role]}">{ROLE_LABELS[role]}</span>
			</div>
		</div>

		<div class={row}>
			<div>
				<h2 class={title}>Вихід</h2>
				<p class={hint}>Завершити сесію на цьому пристрої. Інші пристрої лишаться в системі.</p>
			</div>
			<div class="flex items-center">
				<button
					type="button"
					class="flex h-8 items-center gap-2 rounded-[8px] border border-destructive/40 px-3 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
					onclick={handleSignOut}
					disabled={signingOut}
				>
					{#if signingOut}<Spinner class="size-3.5" />{:else}<LogOut size={15} />{/if}
					{signingOut ? 'Виходимо…' : 'Вийти з акаунта'}
				</button>
			</div>
		</div>
	</section>
</div>
