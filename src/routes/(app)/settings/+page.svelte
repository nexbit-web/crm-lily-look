<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import toast from 'svelte-hot-french-toast';
	import { Sun, Moon, Monitor, LogOut } from '@lucide/svelte';
	import { mode, userPrefersMode, setMode, resetMode } from 'mode-watcher';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { signOut } from '$lib/auth-client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// 'system' скидається через resetMode(), решта — через setMode().
	const themes = [
		{ value: 'light', label: 'Світла', icon: Sun },
		{ value: 'dark', label: 'Темна', icon: Moon },
		{ value: 'system', label: 'Системна', icon: Monitor }
	] as const;

	let signingOut = $state(false);

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
</script>

<svelte:head><title>Налаштування — CRM LILY LOOK</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-2xl font-semibold tracking-tight">Налаштування</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Вигляд</Card.Title>
			<Card.Description>
				Тема інтерфейсу. «Системна» слідує за налаштуванням Windows.
			</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-3">
			<div class="flex flex-wrap gap-2">
				{#each themes as item (item.value)}
					<Button
						variant={userPrefersMode.current === item.value ? 'default' : 'outline'}
						size="sm"
						onclick={() => applyTheme(item.value)}
						aria-pressed={userPrefersMode.current === item.value}
					>
						<item.icon size={16} />
						{item.label}
					</Button>
				{/each}
			</div>

			<p class="text-xs text-muted-foreground">
				Активна тема: {mode.current === 'dark' ? 'темна' : 'світла'}
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>Акаунт</Card.Title>
			<Card.Description>Дані вашого користувача в CRM.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="flex items-center gap-3">
				<div class="min-w-0">
					<p class="truncate text-sm font-medium">{data.user.name}</p>
					<p class="truncate text-xs text-muted-foreground">{data.user.email}</p>
				</div>
				<Badge variant="secondary" class="ml-auto">{data.user.role ?? 'OPERATOR'}</Badge>
			</div>

			<Separator />

			<div class="flex items-center justify-between gap-4">
				<p class="text-sm text-muted-foreground">Завершити сесію на цьому пристрої.</p>
				<Button variant="destructive" onclick={handleSignOut} disabled={signingOut}>
					<LogOut size={16} />
					{signingOut ? 'Виходимо…' : 'Вийти'}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>
</div>
