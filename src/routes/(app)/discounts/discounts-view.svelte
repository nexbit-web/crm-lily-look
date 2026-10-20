<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { postAction, succeeded } from '$lib/post-action';
	import toast from '$lib/toast.svelte';
	import { BadgePercent, FolderTree, Globe, Plus, Shirt } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { formatUah, kopToUahInput } from '$lib/money';
	import { formatPercent } from '$lib/percent';
	import { bodyRow, cell, headRow, pill, pillActive, table } from '$lib/table';
	import DiscountDialog, {
		SCOPE_LABELS,
		type DiscountDraft,
		type Scope
	} from './discount-dialog.svelte';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

	type Row = (typeof data.discounts)[number];
	type Filter = 'all' | 'on' | 'off';

	let open = $state(false);
	let draft = $state<DiscountDraft>(emptyDraft());
	let filter = $state<Filter>('all');

	/**
	 * Перемикач у рядку клацає одразу, не чекаючи сервера; коли свіжі дані
	 * приїдуть, позначку прибираємо.
	 */
	let flipped = $state<Record<string, boolean>>({});
	const isOn = (row: Row) => flipped[row.id] ?? row.isActive;

	const activeCount = $derived(data.discounts.filter((row) => row.isActive).length);

	const FILTERS = $derived([
		{ id: 'all' as const, label: 'Усі', count: data.discounts.length },
		{ id: 'on' as const, label: 'Діють', count: activeCount },
		{ id: 'off' as const, label: 'Вимкнені', count: data.discounts.length - activeCount }
	]);

	const rows = $derived(
		filter === 'all'
			? data.discounts
			: data.discounts.filter((row) => row.isActive === (filter === 'on'))
	);

	const columns = 'grid-cols-[40px_minmax(220px,1.4fr)_110px_minmax(220px,1.6fr)_140px]';
	const HEADERS = ['Назва', 'Знижка', 'Діє на', 'Статус'];

	const SCOPE_ICONS = { ALL: Globe, CATEGORY: FolderTree, PRODUCT: Shirt };

	const categoryLabel = $derived(new Map(data.categories.map((item) => [item.id, item.label])));
	const productLabel = $derived(new Map(data.products.map((item) => [item.id, item.label])));

	function emptyDraft(): DiscountDraft {
		return {
			id: '',
			name: '',
			kind: 'percent',
			value: '',
			scope: 'ALL',
			isActive: true,
			targets: []
		};
	}

	/** «−20%», «−33,6%» або «−150,00 ₴» — те, що знижка забирає з ціни. */
	function valueOf(row: Row): string {
		if (row.percent !== null) return `−${formatPercent(row.percent)}%`;
		if (row.amount !== null) return `−${formatUah(row.amount)}`;
		return '—';
	}

	/** Назви цілей: «Сукні, Пальта +3». Повний перелік — у підказці. */
	function targetsOf(row: Row): { short: string; full: string } {
		if (row.scope === 'ALL') return { short: SCOPE_LABELS.ALL, full: SCOPE_LABELS.ALL };
		const names =
			row.scope === 'CATEGORY'
				? row.categoryIds.map((id) => categoryLabel.get(id) ?? '—')
				: row.productIds.map((id) => productLabel.get(id) ?? '—');
		if (names.length === 0) return { short: '—', full: '' };
		const rest = names.length - 2;
		return {
			short: names.slice(0, 2).join(', ') + (rest > 0 ? ` +${rest}` : ''),
			full: names.join('\n')
		};
	}

	/** «Знижку вимкнено» — з «Скасувати» / Ctrl Z: той самий перемикач назад. */
	function announceToggle(row: Row, on: boolean) {
		toast.message(`«${row.name}» ${on ? 'увімкнено' : 'вимкнено'}.`, {
			id: `discount-toggle-${row.id}`,
			undo: async () => {
				const result = await postAction('/discounts?/toggle', { id: row.id });
				if (!succeeded(result)) toast.error('Не вдалося скасувати');
				await invalidateAll();
			}
		});
	}

	function openCreate() {
		draft = emptyDraft();
		open = true;
	}

	function openEdit(row: Row) {
		draft = {
			id: row.id,
			name: row.name,
			kind: row.amount !== null ? 'amount' : 'percent',
			value: row.amount !== null ? kopToUahInput(row.amount) : String(row.percent ?? ''),
			scope: row.scope as Scope,
			isActive: row.isActive,
			targets: row.scope === 'CATEGORY' ? [...row.categoryIds] : [...row.productIds]
		};
		open = true;
	}
</script>

<svelte:head><title>Знижки — CRM LILY LOOK</title></svelte:head>

<div class="flex flex-col gap-2 pb-6">
	<div class="flex h-8 items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Знижки</h1>
		<span class="text-[17px] font-semibold tracking-tight text-muted-foreground/50">
			{data.discounts.length}
		</span>
	</div>

	<div class="flex flex-wrap items-center gap-1.5">
		{#each FILTERS as item (item.id)}
			<button
				type="button"
				class={filter === item.id ? pillActive : pill}
				aria-pressed={filter === item.id}
				onclick={() => (filter = item.id)}
			>
				{item.label}
				<span class="tabular-nums opacity-60">{item.count}</span>
			</button>
		{/each}

		<p class="ml-2 hidden text-[12px] text-muted-foreground md:block">
			Ціни на сайті перераховуються самі після кожної зміни.
		</p>

		<button
			type="button"
			class="ml-auto flex h-6 items-center gap-1 rounded-[6px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
			onclick={openCreate}
		>
			<Plus size={14} />
			Знижка
		</button>
	</div>

	{#if data.discounts.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-block px-6 py-16 text-center">
			<BadgePercent size={28} class="text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				Знижок ще немає. Поки правил нема, на сайті діють базові ціни.
			</p>
			<Button variant="outline" class="rounded-full" onclick={openCreate}>
				<Plus size={16} />
				Створити першу
			</Button>
		</div>
	{:else}
		<!-- Таблиця притиснута до країв панелі, як замовлення й товари. -->
		<div class="-mr-2 -ml-3 overflow-x-auto">
			<div class="min-w-182.5 {table}" role="table" aria-label="Знижки">
				<div class="{headRow} {columns}" role="row">
					<div class="{cell} justify-center" role="columnheader">#</div>
					{#each HEADERS as header (header)}
						<div class={cell} role="columnheader">{header}</div>
					{/each}
				</div>

				{#each rows as row, index (row.id)}
					{@const on = isOn(row)}
					{@const targets = targetsOf(row)}
					{@const ScopeIcon = SCOPE_ICONS[row.scope as Scope]}
					<div class="{bodyRow} {columns}" role="row">
						<!-- Майже весь рядок — одна кнопка: клік відкриває картку знижки. -->
						<button
							type="button"
							class="col-span-4 grid grid-cols-subgrid text-left outline-none focus-visible:bg-foreground/5"
							onclick={() => openEdit(row)}
						>
							<span class="{cell} justify-center text-muted-foreground tabular-nums" role="cell">
								{index + 1}
							</span>
							<span class="{cell} gap-2" role="cell">
								<span
									class="flex size-6 shrink-0 items-center justify-center rounded-[6px] {on
										? 'bg-[#34c759]/15 text-[#248a3d] dark:bg-[#30d158]/15 dark:text-[#30d158]'
										: 'bg-foreground/6 text-muted-foreground/60'}"
								>
									<BadgePercent size={13} />
								</span>
								<span class="truncate font-medium {on ? '' : 'text-muted-foreground'}">
									{row.name}
								</span>
							</span>
							<span class="{cell} font-semibold tabular-nums" role="cell">{valueOf(row)}</span>
							<!-- Остання клітинка кнопки, але не рядка: лінію праворуч, до
							     колонки «Статус», повертаємо явно. -->
							<span class="{cell} gap-1.5 border-r!" role="cell" title={targets.full}>
								<ScopeIcon size={13} class="shrink-0 text-muted-foreground" />
								<span class="truncate">{targets.short}</span>
							</span>
						</button>

						<!-- Перемикач — прямо з рядка, без відкриття картки. -->
						<span class={cell} role="cell">
							<form
								method="POST"
								action="?/toggle"
								class="flex items-center gap-2"
								use:enhance={() => {
									const next = !on;
									flipped[row.id] = next;
									return async ({ result, update }) => {
										if (result.type === 'failure') {
											toast.error(String(result.data?.message ?? 'Не вдалося перемкнути'));
										} else if (result.type === 'success') {
											announceToggle(row, next);
										}
										await update({ reset: false });
										delete flipped[row.id];
									};
								}}
							>
								<input type="hidden" name="id" value={row.id} />
								<button
									type="submit"
									role="switch"
									aria-checked={on}
									aria-label={on ? 'Вимкнути знижку' : 'Увімкнути знижку'}
									class="relative h-5 w-8.5 shrink-0 rounded-full transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 {on
										? 'bg-[#34c759] dark:bg-[#30d158]'
										: 'bg-foreground/15'}"
								>
									<span
										class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-transform duration-200 {on
											? 'translate-x-3.5'
											: ''}"
									></span>
								</button>
								<span class="text-[12px] {on ? '' : 'text-muted-foreground'}">
									{on ? 'Діє' : 'Вимкнена'}
								</span>
							</form>
						</span>
					</div>
				{:else}
					<p class="border-b border-border px-3 py-6 text-center text-[13px] text-muted-foreground">
						{filter === 'on' ? 'Жодна знижка зараз не діє' : 'Вимкнених знижок немає'}
					</p>
				{/each}
			</div>
		</div>
	{/if}
</div>

<DiscountDialog bind:open bind:draft categories={data.categories} products={data.products} />
