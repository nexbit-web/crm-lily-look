<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import * as Avatar from '$lib/components/ui/avatar/index.js';
	import { ROLES, type Role } from '$lib/permissions';
	import { badge, bodyRow, cell, headRow, pill, pillActive, table } from '$lib/table';
	import { newPassword, ROLE_BADGES, ROLE_HINTS, ROLE_LABELS } from './roles';
	import StaffDialog, { type StaffDraft } from './staff-dialog.svelte';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

	type Staff = (typeof data.staff)[number];

	let open = $state(false);
	// Порожній id = заводимо нового; для наявного редагується лише роль.
	let draft = $state<StaffDraft>({ id: '', name: '', email: '', password: '', role: 'OPERATOR' });

	/** Фільтр за роллю: null — усі. */
	let roleFilter = $state<Role | null>(null);

	const rows = $derived(
		roleFilter ? data.staff.filter((person) => person.role === roleFilter) : data.staff
	);
	const countOf = (role: Role) => data.staff.filter((person) => person.role === role).length;

	const ROLE_PLURALS: Record<Role, string> = {
		ADMIN: 'Адміністратори',
		MANAGER: 'Менеджери',
		OPERATOR: 'Оператори'
	};

	const columns =
		'grid-cols-[40px_minmax(220px,1.3fr)_minmax(200px,1fr)_150px_minmax(220px,1.2fr)_120px]';
	const HEADERS = ['Співробітник', 'Пошта', 'Роль', 'Доступ', 'Додано'];

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
		draft = { id: '', name: '', email: '', password: newPassword(), role: 'OPERATOR' };
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
		open = true;
	}
</script>

<svelte:head><title>Співробітники — CRM LILY LOOK</title></svelte:head>

<div class="flex flex-col gap-2 pb-6">
	<div class="flex h-8 items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Співробітники</h1>
		<span class="text-[17px] font-semibold tracking-tight text-muted-foreground/50">
			{data.staff.length}
		</span>
	</div>

	<div class="flex flex-wrap items-center gap-1.5">
		<button
			type="button"
			aria-pressed={roleFilter === null}
			class={roleFilter === null ? pillActive : pill}
			onclick={() => (roleFilter = null)}
		>
			Усі
			<span class="tabular-nums opacity-60">{data.staff.length}</span>
		</button>
		{#each [...ROLES].reverse() as role (role)}
			<button
				type="button"
				aria-pressed={roleFilter === role}
				class={roleFilter === role ? pillActive : pill}
				onclick={() => (roleFilter = roleFilter === role ? null : role)}
			>
				{ROLE_PLURALS[role]}
				<span class="tabular-nums opacity-60">{countOf(role)}</span>
			</button>
		{/each}

		<button
			type="button"
			class="ml-auto flex h-6 items-center gap-1 rounded-[6px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
			onclick={openCreate}
		>
			<Plus size={14} />
			Співробітник
		</button>
	</div>

	<!-- Таблиця притиснута до країв панелі, як замовлення й товари. -->
	<div class="-mr-2 -ml-3 overflow-x-auto">
		<div class="min-w-215 {table}" role="table" aria-label="Співробітники">
			<div class="{headRow} {columns}" role="row">
				<div class="{cell} justify-center" role="columnheader">#</div>
				{#each HEADERS as header (header)}
					<div class={cell} role="columnheader">{header}</div>
				{/each}
			</div>

			{#each rows as person, index (person.id)}
				{@const me = person.id === data.meId}
				<button
					type="button"
					class="{bodyRow} {columns}"
					role="row"
					onclick={() => openEdit(person)}
				>
					<span class="{cell} justify-center text-muted-foreground tabular-nums" role="cell">
						{index + 1}
					</span>
					<span class="{cell} gap-2" role="cell">
						<Avatar.Root class="size-6 shrink-0">
							<Avatar.Image src={person.image ?? ''} alt={person.name} />
							<Avatar.Fallback class="bg-foreground/8 text-[10px] font-semibold">
								{initials(person.name, person.email)}
							</Avatar.Fallback>
						</Avatar.Root>
						<span class="truncate font-medium">{person.name}</span>
						{#if me}
							<span
								class="shrink-0 rounded-[5px] bg-foreground/8 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase"
							>
								ви
							</span>
						{/if}
					</span>
					<span class="{cell} text-muted-foreground" role="cell">
						<span class="truncate">{person.email}</span>
					</span>
					<span class={cell} role="cell">
						<span class="{badge} {ROLE_BADGES[person.role]}">{ROLE_LABELS[person.role]}</span>
					</span>
					<span class="{cell} text-[12px] text-muted-foreground" role="cell">
						<span class="truncate">{ROLE_HINTS[person.role]}</span>
					</span>
					<span class="{cell} text-muted-foreground tabular-nums" role="cell">
						{joined(person.createdAt)}
					</span>
				</button>
			{:else}
				<p class="border-b border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
					Співробітників із такою роллю немає
				</p>
			{/each}
		</div>
	</div>

	<p class="text-[12px] text-muted-foreground">
		Публічної реєстрації немає — акаунти заводяться тільки звідси. Видалення миттєво завершує всі
		сесії співробітника.
	</p>
</div>

<StaffDialog bind:open bind:draft meId={data.meId} />
