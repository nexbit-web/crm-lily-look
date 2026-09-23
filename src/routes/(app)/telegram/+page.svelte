<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';
	import { Plus, Copy, ChevronRight, X, Send } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import Segmented from '$lib/components/segmented.svelte';
	import {
		accessState,
		BOT_ROLES,
		BOT_ROLE_LABELS,
		INVITE_TERMS,
		inviteState,
		startCommand,
		type BotRoleKey
	} from '$lib/bot';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Person = (typeof data.staff)[number];

	const ROLE_OPTIONS = BOT_ROLES.map((role) => ({ value: role, label: BOT_ROLE_LABELS[role] }));

	const ACCESS_LABELS = { active: '', revoked: 'відкликано', left: 'вийшов' } as const;
	const INVITE_LABELS = { waiting: '', used: 'використаний', expired: 'прострочений' } as const;

	let inviteOpen = $state(false);
	let personOpen = $state(false);
	let saving = $state(false);
	/** Щойно створений код: поки діалог відкритий, показуємо готову команду. */
	let freshCode = $state('');

	let draft = $state({ role: 'MANAGER' as BotRoleKey, note: '', term: '7' });
	let person = $state<Person | null>(null);
	let personRole = $state<BotRoleKey>('MANAGER');
	let roleForm = $state<HTMLFormElement | null>(null);

	const personState = $derived(person ? accessState(person) : 'active');
	/** Останнього адміністратора з доступом вимикати нікуди: коди видає тільки він. */
	const lastAdmin = $derived(
		person?.role === 'ADMIN' && personState === 'active' && data.activeAdmins <= 1
	);

	function day(value: Date | string): string {
		return new Date(value).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
	}

	function initials(name: string): string {
		return name.trim().slice(0, 2).toUpperCase();
	}

	function openInvite() {
		draft = { role: 'MANAGER', note: '', term: '7' };
		freshCode = '';
		inviteOpen = true;
	}

	function openPerson(row: Person) {
		person = row;
		personRole = row.role;
		personOpen = true;
	}

	/** Роль зберігається одразу після вибору — окремої кнопки тут не треба. */
	function pickRole(role: BotRoleKey) {
		if (role === personRole) return;
		personRole = role;
		roleForm?.requestSubmit();
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Скопійовано');
		} catch {
			toast.error('Браузер не дав доступ до буфера');
		}
	}
</script>

<svelte:head><title>Telegram-бот — CRM LILY LOOK</title></svelte:head>

<div class="space-y-7 pb-12">
	<div class="flex items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Telegram-бот</h1>
		<span class="text-2xl font-semibold tracking-tight text-muted-foreground/40">
			{data.staff.filter((row) => accessState(row) === 'active').length}
		</span>
		<Button class="ml-auto rounded-xl px-5" onclick={openInvite}>
			<Plus size={16} />
			Код
		</Button>
	</div>

	<section class="space-y-2">
		<h2 class="px-1 text-[13px] text-muted-foreground">Доступ</h2>

		{#if data.staff.length === 0}
			<div class="flex flex-col items-center gap-3 rounded-[20px] bg-muted/50 px-6 py-12">
				<Send size={24} class="text-muted-foreground/40" />
				<p class="text-sm text-muted-foreground">Ще ніхто не увійшов</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-[20px] bg-muted/50">
				{#each data.staff as row, index (row.id)}
					{@const state = accessState(row)}
					<div class="relative">
						{#if index > 0}
							<span class="pointer-events-none absolute top-0 right-3 left-16 h-px bg-foreground/10"
							></span>
						{/if}

						<button
							type="button"
							class="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-foreground/3 focus-visible:ring-2 focus-visible:ring-ring/50"
							onclick={() => openPerson(row)}
						>
							<span
								class="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground/6 text-xs font-medium {state ===
								'active'
									? ''
									: 'opacity-40'}"
							>
								{initials(row.name)}
							</span>

							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium">{row.name}</p>
								<p class="truncate text-xs text-muted-foreground">
									{row.username ? `@${row.username}` : `id ${row.telegramId}`}
									{#if state !== 'active'}
										· {ACCESS_LABELS[state]}
									{/if}
								</p>
							</div>

							<span class="shrink-0 text-sm text-muted-foreground">
								{BOT_ROLE_LABELS[row.role]}
							</span>
							<ChevronRight size={16} class="shrink-0 text-muted-foreground/40" />
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<section class="space-y-2">
		<h2 class="px-1 text-[13px] text-muted-foreground">Коди</h2>

		{#if data.invites.length === 0}
			<div class="rounded-[20px] bg-muted/50 px-6 py-10 text-center text-sm text-muted-foreground">
				Кодів ще не видавали
			</div>
		{:else}
			<div class="overflow-hidden rounded-[20px] bg-muted/50">
				{#each data.invites as invite, index (invite.id)}
					{@const state = inviteState(invite)}
					<div class="relative flex items-center gap-3 px-3 py-2.5">
						{#if index > 0}
							<span class="pointer-events-none absolute top-0 right-3 left-3 h-px bg-foreground/10"
							></span>
						{/if}

						<div class="min-w-0 flex-1">
							<p
								class="truncate font-mono text-sm {state === 'waiting'
									? 'font-medium'
									: 'text-muted-foreground'}"
							>
								{invite.code}
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{BOT_ROLE_LABELS[invite.role]}
								{#if invite.usedBy}
									· {invite.usedBy.name}
								{:else if state !== 'waiting'}
									· {INVITE_LABELS[state]}
								{:else if invite.note}
									· {invite.note}
								{:else if invite.expiresAt}
									· до {day(invite.expiresAt)}
								{/if}
							</p>
						</div>

						{#if state === 'waiting'}
							<Button
								variant="ghost"
								size="icon-sm"
								class="shrink-0 rounded-full"
								aria-label="Скопіювати команду"
								onclick={() => copy(startCommand(invite.code))}
							>
								<Copy size={15} />
							</Button>
							<form
								method="POST"
								action="?/revokeInvite"
								class="shrink-0"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'failure') {
											toast.error(String(result.data?.message ?? 'Не вдалося відкликати'));
										} else if (result.type === 'success') {
											toast.success('Код відкликано');
										}
										await update({ reset: false });
									};
								}}
							>
								<input type="hidden" name="id" value={invite.id} />
								<Button
									type="submit"
									variant="ghost"
									size="icon-sm"
									class="rounded-full text-muted-foreground hover:text-destructive"
									aria-label="Відкликати код"
								>
									<X size={15} />
								</Button>
							</form>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<!-- Новий код -->
<Dialog.Root bind:open={inviteOpen}>
	<Dialog.Content showCloseButton={false} class="gap-5 rounded-[22px] p-5 sm:max-w-sm">
		{#if freshCode}
			<div class="space-y-4">
				<Dialog.Title class="text-[17px] font-semibold">Код створено</Dialog.Title>
				<p class="rounded-xl bg-foreground/6 px-4 py-3.5 text-center font-mono text-[15px]">
					{startCommand(freshCode)}
				</p>
				<div class="flex gap-2">
					<Button class="flex-1 rounded-xl" onclick={() => copy(startCommand(freshCode))}>
						<Copy size={16} />
						Копіювати
					</Button>
					<Button variant="secondary" class="rounded-xl px-5" onclick={() => (inviteOpen = false)}>
						Готово
					</Button>
				</div>
			</div>
		{:else}
			<form
				method="POST"
				action="?/invite"
				class="contents"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'failure') {
							toast.error(String(result.data?.message ?? 'Не вдалося створити код'));
						} else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Помилка сервера');
						} else if (result.type === 'success') {
							freshCode = String(result.data?.code ?? '');
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="role" value={draft.role} />
				<input type="hidden" name="term" value={draft.term} />

				<div class="flex items-center justify-between">
					<Dialog.Title class="text-[17px] font-semibold">Новий код</Dialog.Title>
					<Dialog.Close>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon-sm"
								class="-mt-1 -mr-1 rounded-full"
								aria-label="Закрити"
							>
								<X size={16} />
							</Button>
						{/snippet}
					</Dialog.Close>
				</div>

				<div class="space-y-2">
					<Label>Роль</Label>
					<Segmented
						value={draft.role}
						options={ROLE_OPTIONS}
						onselect={(role) => (draft.role = role)}
					/>
				</div>

				<div class="space-y-2">
					<Label for="bot-note">Кому видаєте</Label>
					<Input
						id="bot-note"
						name="note"
						bind:value={draft.note}
						placeholder="Олена, склад"
						class="h-10"
					/>
				</div>

				<div class="space-y-2">
					<Label>Термін</Label>
					<Segmented
						value={draft.term}
						options={INVITE_TERMS}
						onselect={(term) => (draft.term = term)}
					/>
				</div>

				<Button type="submit" class="w-full rounded-xl" disabled={saving}>
					{#if saving}<Spinner />{/if}
					Створити код
				</Button>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Доступ людини -->
<Dialog.Root bind:open={personOpen}>
	<Dialog.Content showCloseButton={false} class="gap-5 rounded-[22px] p-5 sm:max-w-sm">
		{#if person}
			{@const current = person}
			<div class="flex items-center gap-3">
				<span
					class="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground/6 text-xs font-medium"
				>
					{initials(current.name)}
				</span>
				<div class="min-w-0 flex-1">
					<Dialog.Title class="truncate text-[17px] font-semibold">{current.name}</Dialog.Title>
					<p class="truncate text-xs text-muted-foreground">
						{current.username ? `@${current.username}` : `id ${current.telegramId}`}
					</p>
				</div>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="-mt-1 -mr-1 shrink-0 rounded-full"
							aria-label="Закрити"
						>
							<X size={16} />
						</Button>
					{/snippet}
				</Dialog.Close>
			</div>

			<form
				method="POST"
				action="?/role"
				bind:this={roleForm}
				class="space-y-2"
				use:enhance={() => {
					return async ({ result, update }) => {
						if (result.type === 'failure') {
							personRole = current.role;
							toast.error(String(result.data?.message ?? 'Не вдалося змінити роль'));
						} else if (result.type === 'success') {
							toast.success('Роль змінено');
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="id" value={current.id} />
				<input type="hidden" name="role" value={personRole} />
				<Label>Роль</Label>
				<Segmented value={personRole} options={ROLE_OPTIONS} onselect={pickRole} />
			</form>

			<form
				method="POST"
				action="?/access"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'failure') {
							toast.error(String(result.data?.message ?? 'Не вдалося змінити доступ'));
						} else if (result.type === 'success') {
							toast.success(personState === 'active' ? 'Доступ відкликано' : 'Доступ повернуто');
							personOpen = false;
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="id" value={current.id} />
				{#if personState !== 'active'}
					<input type="hidden" name="grant" value="on" />
				{/if}

				{#if lastAdmin}
					<p class="mb-2 text-xs text-muted-foreground">
						Останній адміністратор — спершу призначте другого.
					</p>
				{/if}

				<Button
					type="submit"
					class="w-full rounded-xl {personState === 'active'
						? 'bg-destructive text-white hover:bg-destructive/90'
						: ''}"
					disabled={saving || lastAdmin}
				>
					{#if saving}<Spinner />{/if}
					{personState === 'active' ? 'Відкликати доступ' : 'Повернути доступ'}
				</Button>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
