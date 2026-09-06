<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';
	import { Plus, ChevronRight, BadgePercent, X, Check, Search } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { formatUah, kopToUahInput } from '$lib/money';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Row = (typeof data.discounts)[number];
	type Scope = 'ALL' | 'CATEGORY' | 'PRODUCT';

	const SCOPE_LABELS: Record<Scope, string> = {
		ALL: 'Весь каталог',
		CATEGORY: 'Обрані категорії',
		PRODUCT: 'Обрані товари'
	};

	let open = $state(false);
	let saving = $state(false);
	let deleteArmed = $state(false);
	let search = $state('');

	let draft = $state({
		id: '',
		name: '',
		kind: 'percent' as 'percent' | 'amount',
		value: '',
		scope: 'ALL' as Scope,
		isActive: true,
		targets: [] as string[]
	});

	/** Список, з якого обирають: категорії або товари — залежно від області. */
	const pool = $derived(
		draft.scope === 'CATEGORY' ? data.categories : draft.scope === 'PRODUCT' ? data.products : []
	);

	const filteredPool = $derived(
		search.trim() === ''
			? pool
			: pool.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()))
	);

	/** «1 товар», «3 товари», «12 товарів». */
	function plural(count: number, one: string, few: string, many: string): string {
		const mod10 = count % 10;
		const mod100 = count % 100;
		if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`;
		return `${count} ${many}`;
	}

	/** «−20%» або «−150,00 ₴» — те, що знижка забирає з ціни. */
	function valueOf(row: Row): string {
		if (row.percent !== null) return `−${row.percent}%`;
		if (row.amount !== null) return `−${formatUah(row.amount)}`;
		return '—';
	}

	function targetOf(row: Row): string {
		if (row.scope === 'CATEGORY') {
			return plural(row.categoryIds.length, 'категорія', 'категорії', 'категорій');
		}
		if (row.scope === 'PRODUCT') {
			return plural(row.productIds.length, 'товар', 'товари', 'товарів');
		}
		return SCOPE_LABELS.ALL;
	}

	function openCreate() {
		draft = {
			id: '',
			name: '',
			kind: 'percent',
			value: '',
			scope: 'ALL',
			isActive: true,
			targets: []
		};
		search = '';
		deleteArmed = false;
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
		search = '';
		deleteArmed = false;
		open = true;
	}

	function toggleTarget(id: string) {
		draft.targets = draft.targets.includes(id)
			? draft.targets.filter((item) => item !== id)
			: [...draft.targets, id];
	}

	// Зміна області дії скидає вибране: категорії та товари — різні списки.
	function changeScope(next: Scope) {
		draft.scope = next;
		draft.targets = [];
		search = '';
	}
</script>

<svelte:head><title>Знижки — CRM LILY LOOK</title></svelte:head>

{#snippet toggleTrack(on: boolean)}
	<!-- Перемикач як у налаштуваннях iOS: колір доріжки — єдиний сигнал стану. -->
	<span
		class="relative inline-flex h-[26px] w-[42px] shrink-0 rounded-full transition-colors {on
			? 'bg-ring'
			: 'bg-foreground/15'}"
	>
		<span
			class="absolute top-[3px] size-5 rounded-full bg-white shadow-sm transition-all {on
				? 'left-[19px]'
				: 'left-[3px]'}"
		></span>
	</span>
{/snippet}

<div class="mx-auto max-w-3xl space-y-6 pb-12">
	<div class="flex items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Знижки</h1>
		<span class="text-2xl font-semibold tracking-tight text-muted-foreground/40">
			{data.discounts.length}
		</span>
		<Button class="ml-auto rounded-full px-5" onclick={openCreate}>
			<Plus size={16} />
			Знижка
		</Button>
	</div>

	{#if data.discounts.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-muted/50 px-6 py-16 text-center">
			<BadgePercent size={28} class="text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				Знижок ще немає. Ціни на сайті рахуються з правил — поки правил нема, діють базові.
			</p>
			<Button variant="outline" class="rounded-full" onclick={openCreate}>
				<Plus size={16} />
				Створити першу
			</Button>
		</div>
	{:else}
		<!-- Без рамок: фон і радіус відділяють список, роздільники йдуть із
		     відступом від тексту. Перемикач працює просто з рядка. -->
		<div class="overflow-hidden rounded-[20px] bg-muted/50">
			{#each data.discounts as row, index (row.id)}
				<div class="relative flex items-center gap-3 py-1.5 pr-4 pl-3 hover:bg-foreground/[0.03]">
					{#if index > 0}
						<span class="pointer-events-none absolute top-0 right-4 left-16 h-px bg-foreground/10"
						></span>
					{/if}

					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						onclick={() => openEdit(row)}
					>
						<div
							class="flex size-10 shrink-0 items-center justify-center rounded-[12px] {row.isActive
								? 'bg-ring/12 text-ring'
								: 'bg-foreground/[0.06] text-muted-foreground/60'}"
						>
							<BadgePercent size={18} />
						</div>

						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{row.name}</p>
							<p class="truncate text-xs text-muted-foreground">{targetOf(row)}</p>
						</div>

						<span class="ml-auto shrink-0 text-sm font-medium tabular-nums">{valueOf(row)}</span>
						<ChevronRight size={16} class="shrink-0 text-muted-foreground/40" />
					</button>

					<form
						method="POST"
						action="?/toggle"
						class="shrink-0"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'failure') {
									toast.error(String(result.data?.message ?? 'Не вдалося перемкнути'));
								}
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="id" value={row.id} />
						<button
							type="submit"
							role="switch"
							aria-checked={row.isActive}
							aria-label={row.isActive ? 'Вимкнути знижку' : 'Увімкнути знижку'}
						>
							{@render toggleTrack(row.isActive)}
						</button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-[28px] border-0 p-0 shadow-2xl ring-0 sm:max-w-md"
	>
		<form
			method="POST"
			action="?/save"
			class="flex min-h-0 flex-col"
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
						toast.success(result.data?.deleted ? 'Знижку видалено' : 'Збережено');
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="id" value={draft.id} />
			<input type="hidden" name="kind" value={draft.kind} />
			<input type="hidden" name="scope" value={draft.scope} />
			<input type="hidden" name="isActive" value={draft.isActive ? 'on' : ''} />
			<input type="hidden" name="targets" value={JSON.stringify(draft.targets)} />

			<!-- Шапка приклеєна: «закрити» й «зберегти» мають бути під рукою,
			     скільки б товарів не було в списку нижче. -->
			<div class="shrink-0 space-y-4 px-5 pt-5">
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
				</div>

				<Dialog.Header class="gap-1">
					<Dialog.Title class="text-xl tracking-tight">
						{draft.id ? draft.name || 'Знижка' : 'Нова знижка'}
					</Dialog.Title>
					<Dialog.Description>
						Ціну рахує база: із кількох правил виграє те, що дешевше для покупця.
					</Dialog.Description>
				</Dialog.Header>
			</div>

			<!-- Прокручується тільки тіло, тому вікно ніколи не вилазить за екран. -->
			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pt-5 pb-5">
				<div class="overflow-hidden rounded-[18px] bg-muted/60">
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<Label for="dsc-name" class="shrink-0 font-normal">Назва</Label>
						<Input
							id="dsc-name"
							name="name"
							bind:value={draft.name}
							placeholder="Весняний розпродаж"
							class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none"
							required
						/>
					</div>

					<div class="mx-4 h-px bg-foreground/10"></div>

					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<span class="shrink-0 text-sm">Тип</span>
						<Select.Root
							type="single"
							value={draft.kind}
							onValueChange={(value) => (draft.kind = value as 'percent' | 'amount')}
						>
							<Select.Trigger class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none">
								{draft.kind === 'percent' ? 'Відсоток' : 'Фіксована сума'}
							</Select.Trigger>
							<Select.Content class="rounded-[14px]">
								<Select.Item value="percent" label="Відсоток">Відсоток</Select.Item>
								<Select.Item value="amount" label="Фіксована сума">Фіксована сума</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>

					<div class="mx-4 h-px bg-foreground/10"></div>

					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<Label for="dsc-value" class="shrink-0 font-normal">
							{draft.kind === 'percent' ? 'Відсоток' : 'Сума, ₴'}
						</Label>
						<Input
							id="dsc-value"
							name="value"
							bind:value={draft.value}
							inputmode="decimal"
							placeholder={draft.kind === 'percent' ? '20' : '150.00'}
							class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none"
							required
						/>
					</div>
				</div>

				<div class="overflow-hidden rounded-[18px] bg-muted/60">
					<div class="flex items-center justify-between gap-4 px-4 py-3">
						<span class="shrink-0 text-sm">Діє на</span>
						<Select.Root
							type="single"
							value={draft.scope}
							onValueChange={(value) => changeScope(value as Scope)}
						>
							<Select.Trigger class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none">
								{SCOPE_LABELS[draft.scope]}
							</Select.Trigger>
							<Select.Content class="rounded-[14px]">
								<Select.Item value="ALL" label={SCOPE_LABELS.ALL}>{SCOPE_LABELS.ALL}</Select.Item>
								<Select.Item value="CATEGORY" label={SCOPE_LABELS.CATEGORY}>
									{SCOPE_LABELS.CATEGORY}
								</Select.Item>
								<Select.Item value="PRODUCT" label={SCOPE_LABELS.PRODUCT}>
									{SCOPE_LABELS.PRODUCT}
								</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>

					<div class="mx-4 h-px bg-foreground/10"></div>

					<button
						type="button"
						class="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
						onclick={() => (draft.isActive = !draft.isActive)}
					>
						<span class="text-sm">Увімкнена</span>
						{@render toggleTrack(draft.isActive)}
					</button>
				</div>

				{#if draft.scope !== 'ALL'}
					<div class="space-y-2">
						<div class="relative">
							<Search
								size={15}
								class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/60"
							/>
							<Input
								bind:value={search}
								placeholder={draft.scope === 'CATEGORY' ? 'Пошук категорії' : 'Пошук товару'}
								class="h-9 rounded-[10px] border-0 bg-muted/60 pl-9 shadow-none"
							/>
						</div>

						<!-- Позначка ставиться кліком по рядку, як у списках iOS: окремі
					     чекбокси тут лише додали б рамок. -->
						<div class="max-h-64 overflow-y-auto overscroll-contain rounded-[18px] bg-muted/60">
							{#each filteredPool as item (item.id)}
								<button
									type="button"
									class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-foreground/[0.04]"
									onclick={() => toggleTarget(item.id)}
								>
									<span class="truncate text-sm">{item.label}</span>
									{#if draft.targets.includes(item.id)}
										<Check size={16} strokeWidth={2.5} class="shrink-0 text-ring" />
									{/if}
								</button>
							{:else}
								<p class="px-4 py-6 text-center text-sm text-muted-foreground">
									Нічого не знайшлось
								</p>
							{/each}
						</div>

						<p class="px-1 text-xs text-muted-foreground">
							Обрано: {draft.targets.length}
						</p>
					</div>
				{/if}

				{#if draft.id}
					<div class="overflow-hidden rounded-[18px] bg-muted/60">
						{#if deleteArmed}
							<div class="flex items-center justify-between gap-3 px-4 py-2.5">
								<span class="text-sm text-muted-foreground">Видалити назавжди?</span>
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
								Видалити знижку
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>
