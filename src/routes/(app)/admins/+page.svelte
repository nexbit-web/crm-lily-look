<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';
	import { Plus, ChevronRight, X, Check, Copy, RefreshCw } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { ROLES, type Role } from '$lib/permissions';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Staff = (typeof data.staff)[number];

	const ROLE_LABELS: Record<Role, string> = {
		OPERATOR: 'Оператор',
		MANAGER: 'Менеджер',
		ADMIN: 'Адміністратор'
	};

	const ROLE_HINTS: Record<Role, string> = {
		OPERATOR: 'Замовлення, товари й категорії.',
		MANAGER: 'Те саме плюс статистика і знижки.',
		ADMIN: 'Повний доступ, зокрема цей розділ.'
	};

	let open = $state(false);
	let saving = $state(false);
	let deleteArmed = $state(false);

	// Порожній id = заводимо нового; для наявного редагується лише роль.
	let draft = $state({ id: '', name: '', email: '', password: '', role: 'OPERATOR' as Role });

	const isSelf = $derived(draft.id !== '' && draft.id === data.meId);

	function initials(name: string, email: string): string {
		return (name || email).trim().slice(0, 2).toUpperCase();
	}

	function joined(date: Date | string): string {
		return new Date(date).toLocaleDateString('uk-UA', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function openCreate() {
		draft = { id: '', name: '', email: '', password: '', role: 'OPERATOR' };
		deleteArmed = false;
		generatePassword();
		open = true;
	}

	function openEdit(person: Staff) {
		draft = {
			id: person.id,
			name: person.name,
			email: person.email,
			password: '',
			role: person.role
		};
		deleteArmed = false;
		open = true;
	}

	/**
	 * Пароль не треба вигадувати — і не треба вигадувати погано. Алфавіт без
	 * схожих символів (0/O, 1/l/I), щоб його можна було продиктувати.
	 */
	function generatePassword() {
		const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
		const numbers = crypto.getRandomValues(new Uint32Array(16));
		draft.password = Array.from(numbers, (value) => alphabet[value % alphabet.length]).join('');
	}

	async function copyPassword() {
		try {
			await navigator.clipboard.writeText(draft.password);
			toast.success('Пароль скопійовано');
		} catch {
			toast.error('Браузер не дав доступ до буфера — скопіюйте вручну');
		}
	}
</script>

<svelte:head><title>Співробітники — CRM LILY LOOK</title></svelte:head>

{#snippet roleSegments()}
	<!-- Сегментований перемикач замість випадайки: три варіанти видно одразу,
	     як у «Системних параметрах». -->
	<div class="flex gap-1 rounded-[12px] bg-foreground/[0.06] p-1">
		{#each ROLES as role (role)}
			<button
				type="button"
				disabled={isSelf}
				class="flex-1 rounded-[9px] px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 {draft.role ===
				role
					? 'bg-background text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
				onclick={() => (draft.role = role)}
			>
				{ROLE_LABELS[role]}
			</button>
		{/each}
	</div>
{/snippet}

<div class="mx-auto max-w-3xl space-y-6 pb-12">
	<div class="flex items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Співробітники</h1>
		<span class="text-2xl font-semibold tracking-tight text-muted-foreground/40">
			{data.staff.length}
		</span>
		<Button class="ml-auto rounded-full px-5" onclick={openCreate}>
			<Plus size={16} />
			Співробітник
		</Button>
	</div>

	<div class="overflow-hidden rounded-[20px] bg-muted/50">
		{#each data.staff as person, index (person.id)}
			<div class="relative">
				{#if index > 0}
					<span class="pointer-events-none absolute top-0 right-3 left-16 h-px bg-foreground/10"
					></span>
				{/if}

				<button
					type="button"
					class="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50"
					onclick={() => openEdit(person)}
				>
					<Avatar.Root class="size-10 shrink-0">
						<Avatar.Image src={person.image ?? ''} alt={person.name} />
						<Avatar.Fallback class="bg-foreground/[0.06] text-xs">
							{initials(person.name, person.email)}
						</Avatar.Fallback>
					</Avatar.Root>

					<div class="min-w-0 flex-1">
						<p class="flex items-center gap-2 truncate text-sm font-medium">
							{person.name}
							{#if person.id === data.meId}
								<span class="shrink-0 text-xs font-normal text-muted-foreground">це ви</span>
							{/if}
						</p>
						<p class="truncate text-xs text-muted-foreground">
							{person.email} · з {joined(person.createdAt)}
						</p>
					</div>

					<span class="shrink-0 text-sm text-muted-foreground">{ROLE_LABELS[person.role]}</span>
					<ChevronRight size={16} class="shrink-0 text-muted-foreground/40" />
				</button>
			</div>
		{/each}
	</div>

	<p class="px-1 text-xs text-muted-foreground">
		Публічної реєстрації немає — акаунти заводяться тільки звідси. Видалення миттєво завершує всі
		сесії співробітника.
	</p>
</div>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="max-h-[85dvh] gap-5 overflow-y-auto rounded-[28px] border-0 p-5 shadow-2xl ring-0 sm:max-w-md"
	>
		<form
			method="POST"
			action="?/save"
			class="contents"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'failure') {
						toast.error(String(result.data?.message ?? 'Не вдалося зберегти'));
					} else if (result.type === 'error') {
						toast.error(result.error?.message ?? 'Помилка сервера');
					} else if (result.type === 'success') {
						open = false;
						if (result.data?.deleted) toast.success('Співробітника видалено');
						else if (result.data?.created) toast.success('Співробітника додано');
						else toast.success('Збережено');
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="id" value={draft.id} />
			<input type="hidden" name="role" value={draft.role} />

			<div class="flex items-start justify-between">
				<Dialog.Close>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label="Закрити"
							class="flex size-9 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/70 transition-colors hover:bg-foreground/[0.12]"
						>
							<X size={17} strokeWidth={2.5} />
						</button>
					{/snippet}
				</Dialog.Close>

				{#if !isSelf}
					<button
						type="submit"
						aria-label="Зберегти"
						disabled={saving}
						class="flex size-9 items-center justify-center rounded-full bg-ring text-white transition-opacity hover:opacity-90 disabled:opacity-40"
					>
						{#if saving}
							<Spinner />
						{:else}
							<Check size={18} strokeWidth={3} />
						{/if}
					</button>
				{/if}
			</div>

			<Dialog.Header class="gap-1">
				<Dialog.Title class="text-xl tracking-tight">
					{draft.id ? draft.name : 'Новий співробітник'}
				</Dialog.Title>
				<Dialog.Description>
					{#if isSelf}
						Свою роль і свій акаунт змінити не можна — це захист від випадкової втрати доступу.
					{:else if draft.id}
						{draft.email}
					{:else}
						Пошта й пароль — це і є вхід у CRM. Передайте їх особисто.
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			{#if !draft.id}
				<div class="overflow-hidden rounded-[18px] bg-muted/60">
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<Label for="stf-name" class="shrink-0 font-normal">Імʼя</Label>
						<Input
							id="stf-name"
							name="name"
							bind:value={draft.name}
							placeholder="Оля"
							autocomplete="off"
							class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none"
							required
						/>
					</div>

					<div class="mx-4 h-px bg-foreground/10"></div>

					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<Label for="stf-email" class="shrink-0 font-normal">Пошта</Label>
						<Input
							id="stf-email"
							name="email"
							type="email"
							bind:value={draft.email}
							placeholder="olya@lilylook.ua"
							autocomplete="off"
							class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none"
							required
						/>
					</div>

					<div class="mx-4 h-px bg-foreground/10"></div>

					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<Label for="stf-password" class="shrink-0 font-normal">Пароль</Label>
						<Input
							id="stf-password"
							name="password"
							bind:value={draft.password}
							autocomplete="off"
							class="h-9 w-56 rounded-[10px] border-0 bg-background font-mono text-xs shadow-none"
							required
						/>
					</div>
				</div>

				<!-- Пароль генерується одразу при відкритті: набирати його руками
				     нема потреби, а вигадувати — тим більше. -->
				<div class="-mt-3 flex items-center gap-1 px-1">
					<button
						type="button"
						class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
						onclick={generatePassword}
					>
						<RefreshCw size={13} />
						Інший пароль
					</button>
					<button
						type="button"
						class="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
						onclick={copyPassword}
					>
						<Copy size={13} />
						Скопіювати
					</button>
				</div>
			{/if}

			<div class="space-y-2">
				{@render roleSegments()}
				<p class="px-1 text-xs text-muted-foreground">{ROLE_HINTS[draft.role]}</p>
			</div>

			{#if draft.id && !isSelf}
				<div class="overflow-hidden rounded-[18px] bg-muted/60">
					{#if deleteArmed}
						<div class="flex items-center justify-between gap-3 px-4 py-2.5">
							<span class="text-sm text-muted-foreground">Забрати доступ назавжди?</span>
							<div class="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									class="h-8 rounded-full px-3"
									onclick={() => (deleteArmed = false)}
								>
									Ні
								</Button>
								<Button
									type="submit"
									formaction="?/delete"
									variant="destructive"
									size="sm"
									class="h-8 rounded-full px-4"
								>
									Видалити
								</Button>
							</div>
						</div>
					{:else}
						<button
							type="button"
							class="w-full px-4 py-3 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
							onclick={() => (deleteArmed = true)}
						>
							Видалити співробітника
						</button>
					{/if}
				</div>
			{/if}
		</form>
	</Dialog.Content>
</Dialog.Root>
