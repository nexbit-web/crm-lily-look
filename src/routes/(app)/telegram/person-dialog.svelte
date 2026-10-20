<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from '$lib/toast.svelte';
	import { Ban, RotateCcw, X } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { accessState, type BotRoleKey } from '$lib/bot';
	import RoleCards from './role-cards.svelte';
	import { initials } from './roles';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	type Person = Loaded<PageData>['staff'][number];

	/**
	 * Доступ людини до бота: роль (зберігається одразу після вибору) і
	 * «відкликати / повернути доступ» унизу.
	 */
	let {
		open = $bindable(false),
		person,
		activeAdmins
	}: { open?: boolean; person: Person | null; activeAdmins: number } = $props();

	let saving = $state(false);
	let role = $state<BotRoleKey>('MANAGER');
	let roleForm = $state<HTMLFormElement | null>(null);

	// Відкрили картку іншої людини — показуємо її роль.
	$effect(() => {
		if (open && person) role = person.role;
	});

	const access = $derived(person ? accessState(person) : 'active');
	/** Останнього адміністратора з доступом вимикати нікуди: коди видає тільки він. */
	const lastAdmin = $derived(person?.role === 'ADMIN' && access === 'active' && activeAdmins <= 1);

	const STATE_LABELS = {
		active: 'Має доступ до бота',
		revoked: 'Доступ відкликано',
		left: 'Вийшов із бота сам'
	} as const;

	/** Роль зберігається одразу після вибору — окремої кнопки тут не треба. */
	function pickRole(next: BotRoleKey) {
		if (next === role) return;
		role = next;
		roleForm?.requestSubmit();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-[16px] border border-border p-0 shadow-2xl ring-0 sm:max-w-110"
	>
		{#if person}
			{@const current = person}
			<header class="flex items-center gap-3 border-b border-border px-5 py-3.5">
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-[12px] font-semibold"
				>
					{initials(current.name)}
				</span>
				<Dialog.Header class="min-w-0 flex-1 gap-0.5 text-left">
					<Dialog.Title class="truncate text-[17px] font-semibold tracking-tight">
						{current.name}
					</Dialog.Title>
					<Dialog.Description class="truncate text-[12px]">
						{current.username ? `@${current.username}` : `id ${current.telegramId}`}
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Close>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label="Закрити"
							class="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
						>
							<X size={17} />
						</button>
					{/snippet}
				</Dialog.Close>
			</header>

			<form
				method="POST"
				action="?/role"
				bind:this={roleForm}
				class="min-h-0 space-y-1.5 overflow-y-auto p-5"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'failure') {
							role = current.role;
							toast.error(String(result.data?.message ?? 'Не вдалося змінити роль'));
						} else if (result.type === 'success') {
							toast.success('Роль змінено', { subject: current.name });
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="id" value={current.id} />
				<input type="hidden" name="role" value={role} />
				<span class="text-[12px] font-medium text-muted-foreground">Роль у боті</span>
				<RoleCards value={role} onselect={pickRole} />
				<p class="text-[12px] text-muted-foreground">Зберігається одразу після вибору.</p>
			</form>

			<form
				method="POST"
				action="?/access"
				class="flex items-center gap-2 border-t border-border px-5 py-3"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'failure') {
							toast.error(String(result.data?.message ?? 'Не вдалося змінити доступ'));
						} else if (result.type === 'success') {
							toast.message(
								access === 'active'
									? `${current.name}: доступ відкликано.`
									: `${current.name}: доступ повернуто.`
							);
							open = false;
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="id" value={current.id} />
				{#if access !== 'active'}
					<input type="hidden" name="grant" value="on" />
				{/if}

				<span class="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
					<span
						class="size-2 shrink-0 rounded-full {access === 'active'
							? 'bg-emerald-500'
							: access === 'revoked'
								? 'bg-red-500'
								: 'bg-foreground/30'}"
					></span>
					<span class="truncate">
						{lastAdmin ? 'Останній адміністратор — спершу призначте другого' : STATE_LABELS[access]}
					</span>
				</span>

				<button
					type="submit"
					disabled={saving || lastAdmin}
					class="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors disabled:opacity-50 {access ===
					'active'
						? 'text-destructive hover:bg-destructive/10'
						: 'bg-primary text-primary-foreground hover:opacity-90'}"
				>
					{#if saving}
						<Spinner class="size-3.5" />
					{:else if access === 'active'}
						<Ban size={13} />
					{:else}
						<RotateCcw size={13} />
					{/if}
					{access === 'active' ? 'Відкликати доступ' : 'Повернути доступ'}
				</button>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
