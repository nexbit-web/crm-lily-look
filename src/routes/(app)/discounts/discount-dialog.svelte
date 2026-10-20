<script lang="ts" module>
	export type Scope = 'ALL' | 'CATEGORY' | 'PRODUCT';
	export type Kind = 'percent' | 'amount';

	export type DiscountDraft = {
		id: string;
		name: string;
		kind: Kind;
		value: string;
		scope: Scope;
		isActive: boolean;
		targets: string[];
	};

	export const SCOPE_LABELS: Record<Scope, string> = {
		ALL: 'Весь каталог',
		CATEGORY: 'Категорії',
		PRODUCT: 'Товари'
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from '$lib/toast.svelte';
	import { Check, FolderTree, Globe, Search, Shirt, Trash2, X } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	type Option = { id: string; label: string };

	/**
	 * Картка знижки в стилі CRM: шапка з назвою, поля одне під одним,
	 * унизу — видалити ліворуч, скасувати й зберегти праворуч.
	 */
	let {
		open = $bindable(false),
		draft = $bindable(),
		categories,
		products
	}: {
		open?: boolean;
		draft: DiscountDraft;
		categories: Option[];
		products: Option[];
	} = $props();

	let saving = $state(false);
	let deleteArmed = $state(false);
	let search = $state('');

	// Щоразу, як картку відкривають, пошук і підтвердження видалення скинуті.
	$effect(() => {
		if (open) {
			deleteArmed = false;
			search = '';
		}
	});

	const KINDS: { id: Kind; label: string }[] = [
		{ id: 'percent', label: 'Відсоток' },
		{ id: 'amount', label: 'Сума' }
	];

	const SCOPES = [
		{ id: 'ALL', icon: Globe },
		{ id: 'CATEGORY', icon: FolderTree },
		{ id: 'PRODUCT', icon: Shirt }
	] as const;

	/** Список, з якого обирають: категорії або товари — залежно від області. */
	const pool = $derived(
		draft.scope === 'CATEGORY' ? categories : draft.scope === 'PRODUCT' ? products : []
	);

	const filteredPool = $derived.by(() => {
		const query = search.trim().toLowerCase();
		return query === '' ? pool : pool.filter((item) => item.label.toLowerCase().includes(query));
	});

	function toggleTarget(id: string) {
		draft.targets = draft.targets.includes(id)
			? draft.targets.filter((item) => item !== id)
			: [...draft.targets, id];
	}

	// Зміна області дії скидає вибране: категорії та товари — різні списки.
	function changeScope(next: Scope) {
		if (draft.scope === next) return;
		draft.scope = next;
		draft.targets = [];
		search = '';
	}

	const fieldLabel = 'text-[12px] font-medium text-muted-foreground';
	const control = 'h-8 text-[13px] md:text-[13px]';
	/** Сегментований перемикач: сіра доріжка, вибране — біла плитка. */
	const segments = 'flex h-8 rounded-[8px] bg-foreground/6 p-0.5';
	const segment =
		'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium transition-colors';
	const segmentOn = 'bg-card text-foreground shadow-sm ring-1 ring-border';
	const segmentOff = 'text-muted-foreground hover:text-foreground';
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-[16px] border border-border p-0 shadow-2xl ring-0 sm:max-w-120 md:max-w-200"
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
						if (result.data?.deleted) toast.message('Знижку видалено.');
						else if (draft.id) toast.success('Знижку збережено');
						else {
							toast.success('Знижку створено', {
								subject: draft.name,
								description: ` — ${draft.kind === 'percent' ? `−${draft.value}%` : `−${draft.value} ₴`}, ${SCOPE_LABELS[draft.scope].toLowerCase()}${draft.isActive ? '' : ' (вимкнена)'}`
							});
						}
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="id" value={draft.id} />
			<input type="hidden" name="kind" value={draft.kind} />
			<input type="hidden" name="scope" value={draft.scope} />
			<input type="hidden" name="targets" value={JSON.stringify(draft.targets)} />

			<!-- Шапка -->
			<header class="flex items-start gap-3 border-b border-border px-5 py-3.5">
				<Dialog.Header class="min-w-0 flex-1 gap-0.5 text-left">
					<Dialog.Title class="truncate text-[17px] font-semibold tracking-tight">
						{draft.id ? draft.name || 'Знижка' : 'Нова знижка'}
					</Dialog.Title>
					<Dialog.Description class="text-[12px]">
						Із кількох знижок на товар діє та, що вигідніша покупцю
					</Dialog.Description>
				</Dialog.Header>
				<Dialog.Close>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label="Закрити"
							class="-mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
						>
							<X size={17} />
						</button>
					{/snippet}
				</Dialog.Close>
			</header>

			<!-- Дві колонки: ліворуч — сама знижка, праворуч — на що вона діє.
			     Усе вміщується без прокрутки; на вузькому екрані колонки стають одна
			     під одною й тіло прокручується. -->
			<div class="grid min-h-0 overflow-y-auto md:grid-cols-2 md:overflow-visible">
				<div class="space-y-4 p-5">
					<div class="space-y-1.5">
						<Label for="dsc-name" class={fieldLabel}>Назва</Label>
						<Input
							id="dsc-name"
							name="name"
							bind:value={draft.name}
							placeholder="Весняний розпродаж"
							class={control}
							required
						/>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<span class={fieldLabel}>Тип</span>
							<div class={segments} role="radiogroup" aria-label="Тип знижки">
								{#each KINDS as kind (kind.id)}
									<button
										type="button"
										role="radio"
										aria-checked={draft.kind === kind.id}
										class="{segment} {draft.kind === kind.id ? segmentOn : segmentOff}"
										onclick={() => (draft.kind = kind.id)}
									>
										{kind.label}
									</button>
								{/each}
							</div>
						</div>

						<div class="space-y-1.5">
							<Label for="dsc-value" class={fieldLabel}>Розмір</Label>
							<div class="relative">
								<Input
									id="dsc-value"
									name="value"
									bind:value={draft.value}
									inputmode="decimal"
									placeholder={draft.kind === 'percent' ? '20' : '150'}
									class="{control} pr-7 tabular-nums"
									required
								/>
								<span
									class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] text-muted-foreground"
								>
									{draft.kind === 'percent' ? '%' : '₴'}
								</span>
							</div>
						</div>
					</div>

					<div class="space-y-1.5">
						<span class={fieldLabel}>Діє на</span>
						<div class={segments} role="radiogroup" aria-label="Діє на">
							{#each SCOPES as scope (scope.id)}
								<button
									type="button"
									role="radio"
									aria-checked={draft.scope === scope.id}
									class="{segment} {draft.scope === scope.id ? segmentOn : segmentOff}"
									onclick={() => changeScope(scope.id)}
								>
									<scope.icon size={13} class="shrink-0" />
									<span class="truncate">{SCOPE_LABELS[scope.id]}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Увімкнена: зелений перемикач, як «Показувати на сайті» в товарі.
					     Під ним звичайний чекбокс — на сервер їде isActive=on. -->
					<label
						for="dsc-active"
						class="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border px-3 py-2.5"
					>
						<span class="min-w-0 flex-1">
							<span class="block text-[13px] font-medium">Знижка діє</span>
							<span class="block text-[12px] text-muted-foreground">
								Вимкнена не змінює ціни на сайті
							</span>
						</span>
						<input
							id="dsc-active"
							type="checkbox"
							name="isActive"
							value="on"
							bind:checked={draft.isActive}
							class="peer sr-only"
						/>
						<span
							aria-hidden="true"
							class="relative h-6 w-10 shrink-0 rounded-full bg-foreground/15 transition-colors duration-200 peer-checked:bg-[#34c759] peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-[0_2px_4px_rgba(0,0,0,0.2)] after:transition-transform after:duration-200 peer-checked:after:translate-x-4 dark:peer-checked:bg-[#30d158]"
						></span>
					</label>
				</div>

				<!-- Права колонка: що саме знижує. Висота стала, щоб вікно не стрибало
				     при зміні «Діє на». -->
				<div
					class="flex flex-col gap-1.5 border-t border-border p-5 md:border-t-0 md:border-l md:bg-table-head/40"
				>
					<span class={fieldLabel}>
						{draft.scope === 'ALL'
							? 'Охоплення'
							: draft.scope === 'CATEGORY'
								? 'Обрані категорії'
								: 'Обрані товари'}
					</span>

					{#if draft.scope === 'ALL'}
						<div
							class="flex h-75 flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border px-6 text-center"
						>
							<Globe size={22} class="text-muted-foreground/60" />
							<p class="text-[13px] font-medium">Весь каталог</p>
							<p class="text-[12px] text-muted-foreground">
								Знижка діє на кожен товар. Щоб обмежити — виберіть «Категорії» або «Товари».
							</p>
						</div>
					{:else}
						<!-- Вибір цілей: пошук зверху, список із позначками, лічильник унизу. -->
						<div
							class="flex h-75 flex-col overflow-hidden rounded-[10px] border border-border bg-card"
						>
							<div class="relative border-b border-border">
								<Search
									size={14}
									class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
								/>
								<input
									bind:value={search}
									aria-label={draft.scope === 'CATEGORY' ? 'Пошук категорії' : 'Пошук товару'}
									placeholder={draft.scope === 'CATEGORY' ? 'Назва категорії' : 'Назва товару'}
									class="h-8 w-full bg-transparent pr-2.5 pl-8 text-[13px] outline-none placeholder:text-muted-foreground"
								/>
							</div>

							<div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
								{#each filteredPool as item (item.id)}
									{@const checked = draft.targets.includes(item.id)}
									<button
										type="button"
										role="checkbox"
										aria-checked={checked}
										class="flex h-8 w-full items-center gap-2.5 rounded-[6px] px-2 text-left text-[13px] transition-colors hover:bg-foreground/5"
										onclick={() => toggleTarget(item.id)}
									>
										<span
											class="flex size-4 shrink-0 items-center justify-center rounded-lg border transition-colors {checked
												? 'border-primary bg-primary text-primary-foreground'
												: 'border-foreground/25'}"
										>
											{#if checked}<Check size={11} strokeWidth={3} />{/if}
										</span>
										<span class="truncate">{item.label}</span>
									</button>
								{:else}
									<p class="px-2 py-6 text-center text-[12px] text-muted-foreground">
										Нічого не знайшлось
									</p>
								{/each}
							</div>

							<div
								class="flex h-8 items-center border-t border-border bg-table-head px-2.5 text-[12px] text-muted-foreground"
							>
								Обрано {draft.targets.length} з {pool.length}
								{#if draft.targets.length > 0}
									<button
										type="button"
										class="ml-auto rounded-lg px-1 font-medium hover:text-foreground"
										onclick={() => (draft.targets = [])}
									>
										Зняти всі
									</button>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Низ: видалити ліворуч, зберегти праворуч -->
			<footer class="flex items-center gap-2 border-t border-border px-5 py-3">
				{#if draft.id}
					{#if deleteArmed}
						<span class="text-[12px] text-muted-foreground">Видалити назавжди?</span>
						<button
							type="submit"
							formaction="?/delete"
							formnovalidate
							class="h-7 rounded-[6px] bg-destructive px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
						>
							Так, видалити
						</button>
						<button
							type="button"
							class="h-7 rounded-[6px] px-2 text-[12px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
							onclick={() => (deleteArmed = false)}
						>
							Ні
						</button>
					{:else}
						<button
							type="button"
							class="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"
							onclick={() => (deleteArmed = true)}
						>
							<Trash2 size={13} />
							Видалити
						</button>
					{/if}
				{/if}

				<div class="ml-auto flex items-center gap-1.5">
					<Dialog.Close>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="h-7 rounded-[6px] px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
							>
								Скасувати
							</button>
						{/snippet}
					</Dialog.Close>
					<button
						type="submit"
						disabled={saving}
						class="flex h-7 items-center gap-1.5 rounded-[6px] bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{#if saving}<Spinner class="size-3.5" />{/if}
						{draft.id ? 'Зберегти' : 'Створити'}
					</button>
				</div>
			</footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
