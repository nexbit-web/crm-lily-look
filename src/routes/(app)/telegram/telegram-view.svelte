<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from '$lib/toast.svelte';
	import { Copy, KeyRound, Plus, Send, Users, X } from '@lucide/svelte';
	import { accessState, BOT_ROLE_LABELS, inviteState, startCommand } from '$lib/bot';
	import { badge, bodyRow, cell, headRow, table } from '$lib/table';
	import { BOT_ROLE_BADGES, initials } from './roles';
	import InviteDialog from './invite-dialog.svelte';
	import PersonDialog from './person-dialog.svelte';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

	type Person = (typeof data.staff)[number];
	type Tab = 'access' | 'codes';

	let tab = $state<Tab>('access');
	let inviteOpen = $state(false);
	let personOpen = $state(false);
	/** Картка людини читає свіжі дані: після зміни ролі — нова роль. */
	let personId = $state('');
	const person = $derived(data.staff.find((row) => row.id === personId) ?? null);

	const activeCount = $derived(data.staff.filter((row) => accessState(row) === 'active').length);
	const waitingCount = $derived(
		data.invites.filter((invite) => inviteState(invite) === 'waiting').length
	);

	const TABS = $derived([
		{ id: 'access' as const, label: 'Доступ', icon: Users, count: data.staff.length },
		{ id: 'codes' as const, label: 'Коди', icon: KeyRound, count: data.invites.length }
	]);

	const ACCESS = {
		active: { label: 'Активний', dot: 'bg-emerald-500' },
		revoked: { label: 'Відкликано', dot: 'bg-red-500' },
		left: { label: 'Вийшов сам', dot: 'bg-foreground/30' }
	} as const;

	const INVITE = {
		waiting: { label: 'Чекає', dot: 'bg-sky-500' },
		used: { label: 'Використаний', dot: 'bg-emerald-500' },
		expired: { label: 'Прострочений', dot: 'bg-foreground/30' }
	} as const;

	const peopleColumns = 'grid-cols-[40px_minmax(200px,1.4fr)_minmax(160px,1fr)_150px_150px_120px]';
	const codeColumns =
		'grid-cols-[40px_minmax(190px,1fr)_150px_minmax(120px,0.6fr)_minmax(280px,1.4fr)_110px]';

	function day(value: Date | string): string {
		return new Date(value).toLocaleDateString('uk-UA', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function openPerson(row: Person) {
		personId = row.id;
		personOpen = true;
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Команду скопійовано', { description: text });
		} catch {
			toast.error('Браузер не дав доступ до буфера');
		}
	}

	const iconButton =
		'flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground';
</script>

<svelte:head><title>Telegram Bot — CRM LILY LOOK</title></svelte:head>

{#snippet status(label: string, dot: string)}
	<span class="flex shrink-0 items-center gap-1.5 text-[12px]">
		<span class="size-2 shrink-0 rounded-full {dot}"></span>
		{label}
	</span>
{/snippet}

<div class="flex flex-col gap-2 pb-6">
	<div class="flex h-8 items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Telegram Bot</h1>
		<span class="text-[17px] font-semibold tracking-tight text-muted-foreground/50">
			{activeCount}
		</span>
		<span class="text-[12px] text-muted-foreground">з доступом</span>
	</div>

	<!-- Вкладки, як види в ClickUp: смуга на всю ширину, під вибраною — риска. -->
	<nav
		aria-label="Розділи бота"
		class="-mr-2 -ml-3 flex items-center gap-x-1 border-b border-border pr-2 pl-1.5"
	>
		{#each TABS as item (item.id)}
			{@const active = tab === item.id}
			<button
				type="button"
				aria-pressed={active}
				class="relative flex h-10 items-center gap-1.5 rounded-[6px] px-2 text-[13px] transition-colors {active
					? 'font-semibold text-foreground'
					: 'font-medium text-muted-foreground hover:text-foreground'}"
				onclick={() => (tab = item.id)}
			>
				<item.icon size={15} />
				{item.label}
				<span class="text-[12px] font-normal text-muted-foreground tabular-nums">{item.count}</span>
				{#if active}
					<span class="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground"></span>
				{/if}
			</button>
		{/each}

		<button
			type="button"
			class="ml-auto flex h-6 items-center gap-1 rounded-[6px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
			onclick={() => (inviteOpen = true)}
		>
			<Plus size={14} />
			Код входу
		</button>
	</nav>

	{#if tab === 'access'}
		<p class="text-[12px] text-muted-foreground">
			Хто користується ботом. Клік по рядку — змінити роль або відкликати доступ.
		</p>

		{#if data.staff.length === 0}
			<div
				class="flex flex-col items-center gap-2 rounded-[12px] border border-border px-6 py-12 text-center"
			>
				<Send size={22} class="text-muted-foreground/40" />
				<p class="text-[13px] text-muted-foreground">
					Ще ніхто не увійшов — створіть код і передайте людині.
				</p>
			</div>
		{:else}
			<div class="-mr-2 -ml-3 overflow-x-auto">
				<div class="min-w-190 {table}" role="table" aria-label="Доступ до бота">
					<div class="{headRow} {peopleColumns}" role="row">
						<span class="{cell} justify-center" role="columnheader">#</span>
						{#each ['Людина', 'Telegram', 'Роль', 'Стан', 'Приєднався'] as header (header)}
							<span class={cell} role="columnheader">{header}</span>
						{/each}
					</div>

					{#each data.staff as row, index (row.id)}
						{@const state = accessState(row)}
						<button
							type="button"
							class="{bodyRow} {peopleColumns}"
							role="row"
							onclick={() => openPerson(row)}
						>
							<span class="{cell} justify-center text-muted-foreground tabular-nums" role="cell">
								{index + 1}
							</span>
							<span class="{cell} gap-2" role="cell">
								<span
									class="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/8 text-[10px] font-semibold {state ===
									'active'
										? ''
										: 'opacity-50'}"
								>
									{initials(row.name)}
								</span>
								<span
									class="truncate font-medium {state === 'active' ? '' : 'text-muted-foreground'}"
								>
									{row.name}
								</span>
							</span>
							<span class="{cell} text-muted-foreground" role="cell">
								<span class="truncate">
									{row.username ? `@${row.username}` : `id ${row.telegramId}`}
								</span>
							</span>
							<span class={cell} role="cell">
								<span class="{badge} {BOT_ROLE_BADGES[row.role]}">{BOT_ROLE_LABELS[row.role]}</span>
							</span>
							<span class={cell} role="cell">
								{@render status(ACCESS[state].label, ACCESS[state].dot)}
							</span>
							<span class="{cell} text-muted-foreground tabular-nums" role="cell">
								{day(row.createdAt)}
							</span>
						</button>
					{/each}
				</div>
			</div>
		{/if}
	{:else}
		<p class="text-[12px] text-muted-foreground">
			Людина надсилає боту <span class="font-mono">/start КОД</span> — і входить із роллю коду.
			Чекають використання: {waitingCount}.
		</p>

		{#if data.invites.length === 0}
			<div
				class="flex flex-col items-center gap-2 rounded-[12px] border border-border px-6 py-12 text-center"
			>
				<KeyRound size={22} class="text-muted-foreground/40" />
				<p class="text-[13px] text-muted-foreground">Кодів ще не видавали</p>
			</div>
		{:else}
			<div class="-mr-2 -ml-3 overflow-x-auto">
				<div class="min-w-225 {table}" role="table" aria-label="Коди входу">
					<div class="{headRow} {codeColumns}" role="row">
						<span class="{cell} justify-center" role="columnheader">#</span>
						{#each ['Код', 'Роль', 'Кому', 'Стан', 'Діє до'] as header (header)}
							<span class={cell} role="columnheader">{header}</span>
						{/each}
					</div>

					{#each data.invites as invite, index (invite.id)}
						{@const state = inviteState(invite)}
						<div class="{bodyRow} {codeColumns}" role="row">
							<span class="{cell} justify-center text-muted-foreground tabular-nums" role="cell">
								{index + 1}
							</span>
							<span
								class="{cell} gap-1 pr-1 font-mono {state === 'waiting'
									? 'font-semibold'
									: 'text-muted-foreground'}"
								role="cell"
							>
								<span
									class="min-w-0 flex-1 truncate {state === 'waiting'
										? ''
										: 'line-through decoration-red-500 decoration-[1.5px]'}"
								>
									{invite.code}
								</span>
								<!-- Код ще чекає — скопіювати команду чи відкликати, тут же праворуч. -->
								{#if state === 'waiting'}
									<button
										type="button"
										class={iconButton}
										title="Скопіювати команду"
										aria-label="Скопіювати команду"
										onclick={() => copy(startCommand(invite.code))}
									>
										<Copy size={13} />
									</button>
									<form
										method="POST"
										action="?/revokeInvite"
										use:enhance={() => {
											return async ({ result, update }) => {
												if (result.type === 'failure') {
													toast.error(String(result.data?.message ?? 'Не вдалося відкликати'));
												} else if (result.type === 'success') {
													toast.message(`Код ${invite.code} відкликано.`);
												}
												await update({ reset: false });
											};
										}}
									>
										<input type="hidden" name="id" value={invite.id} />
										<button
											type="submit"
											class="{iconButton} hover:bg-destructive/10 hover:text-destructive"
											title="Відкликати код"
											aria-label="Відкликати код"
										>
											<X size={14} />
										</button>
									</form>
								{/if}
							</span>
							<span class={cell} role="cell">
								<span class="{badge} {BOT_ROLE_BADGES[invite.role]}">
									{BOT_ROLE_LABELS[invite.role]}
								</span>
							</span>
							<span class="{cell} text-muted-foreground" role="cell">
								<span class="truncate">{invite.note || '—'}</span>
							</span>
							<span class="{cell} gap-1" role="cell">
								{@render status(INVITE[state].label, INVITE[state].dot)}
								{#if invite.usedBy}
									<span class="truncate text-[12px] text-muted-foreground">
										· {invite.usedBy.name}
									</span>
								{/if}
							</span>
							<span class="{cell} text-muted-foreground tabular-nums" role="cell">
								{invite.expiresAt ? day(invite.expiresAt) : 'безстроково'}
							</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<InviteDialog bind:open={inviteOpen} />
<PersonDialog bind:open={personOpen} {person} activeAdmins={data.activeAdmins} />
