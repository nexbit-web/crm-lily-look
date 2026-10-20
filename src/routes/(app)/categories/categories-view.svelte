<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { postAction } from '$lib/post-action';
	import toast from '$lib/toast.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Check, CornerDownRight, FolderTree, GripVertical, Minus, Plus } from '@lucide/svelte';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import { bodyRow, cell, headRow, table } from '$lib/table';
	import CategoryDialog, { ROOT, type CategoryDraft } from './category-dialog.svelte';
	import { moveWithin, siblingIndex, withSiblingOrder } from './tree-order';
	import SelectionBar from './selection-bar.svelte';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

	type Row = (typeof data.categories)[number];

	/** Глибше третього рівня магазин категорії не показує. */
	const MAX_DEPTH = 2;

	let open = $state(false);
	// Порожній id = створюємо нову; решта полів — чернетка, поки не збережуть.
	let draft = $state<CategoryDraft>({ id: '', name: '', slug: '', parentId: ROOT, imageUrl: '' });

	/**
	 * Чернетка порядку: перетягування міняє лише її, у базу — тільки по
	 * «Зберегти». Ключ — батько (ROOT для верхнього рівня), значення — новий
	 * порядок його дітей. Випадковий кидок нічого не зіпсує: «Скасувати».
	 */
	let reordered = $state<Record<string, string[]>>({});
	let savingOrder = $state(false);

	const rows = $derived(
		Object.entries(reordered).reduce(
			(list, [parent, ids]) => withSiblingOrder(list, parent === ROOT ? null : parent, ids),
			data.categories
		)
	);

	/** Ряди, чий порядок справді відрізняється від того, що в базі. */
	const changedGroups = $derived(
		Object.entries(reordered).filter(([parent, ids]) => {
			const parentId = parent === ROOT ? null : parent;
			const saved = data.categories.filter((row) => row.parentId === parentId).map((row) => row.id);
			return ids.join() !== saved.join();
		})
	);
	const dirty = $derived(changedGroups.length > 0);

	/**
	 * Перетягування на подіях вказівника, а не на HTML5 drag-and-drop: той у
	 * Chrome тихо скасовується, щойно сторінка перемальовується під час
	 * перетягування, і кидок просто не спрацьовує. Вказівник однаково працює
	 * з мишею й пальцем.
	 *
	 * `dy` — наскільки рядок зсунули від місця, де його взяли (з урахуванням
	 * прокрутки), `drop` — перед яким чи після якого сусіда він ляже.
	 */
	let drag = $state<{
		id: string;
		parentId: string | null;
		startY: number;
		startScroll: number;
		dy: number;
	} | null>(null);
	let drop = $state<{ id: string; after: boolean } | null>(null);
	/** Контейнер, що прокручується (main), — для автопрокрутки біля краю. */
	let scroller: HTMLElement | null = null;

	const byId = $derived(new Map(data.categories.map((row) => [row.id, row])));

	/** «Сукні → Вечірні» — шлях від кореня, щоб у списку не було двох «Нових». */
	function pathOf(id: string): string {
		const parts: string[] = [];
		let current = byId.get(id);
		for (let depth = 0; current && depth < 10; depth += 1) {
			parts.unshift(current.name);
			current = current.parentId ? byId.get(current.parentId) : undefined;
		}
		return parts.join(' → ');
	}

	// Батьком не може стати ні сама категорія, ні її нащадок — інакше дерево
	// замкнеться саме на себе. Заодно ховаємо надто глибокі рівні.
	const parentOptions = $derived.by(() => {
		const parentById = new Map(data.categories.map((row) => [row.id, row.parentId]));

		/** Чи лежить рядок усередині категорії, яку зараз редагують. */
		const inside = (id: string) => {
			let current: string | null | undefined = id;
			for (let depth = 0; current && depth < 20; depth += 1) {
				if (current === draft.id) return true;
				current = parentById.get(current);
			}
			return false;
		};

		return data.categories.filter(
			(row) => row.depth < MAX_DEPTH && !(draft.id !== '' && inside(row.id))
		);
	});

	const columns = 'grid-cols-[40px_minmax(260px,2fr)_minmax(180px,1fr)_100px_120px]';
	const HEADERS = ['Категорія', 'Адреса', 'Товарів', 'Підкатегорій'];
	/** Рядок категорій — 34 px: перша клітинка 40×34 вміщує ручку й чекбокс. */
	const row34 = bodyRow.replace('h-9', 'h-8.5');

	/**
	 * Вибір рядків, як у ClickUp: замість номера — чекбокс під курсором або
	 * коли вже щось вибрано; Shift — діапазон від попереднього кліку. Унизу
	 * тоді виїжджає панель масових дій.
	 */
	const selected = new SvelteSet<string>();
	let anchor: number | null = null;
	let bulkBusy = $state(false);

	/** Вибрані — у порядку таблиці (так їх і переносимо). */
	const selectedRows = $derived(rows.filter((row) => selected.has(row.id)));
	const allSelected = $derived(rows.length > 0 && selectedRows.length === rows.length);

	function toggleRow(index: number, shift: boolean) {
		const row = rows[index];
		if (shift && anchor !== null) {
			const [from, to] = anchor < index ? [anchor, index] : [index, anchor];
			const value = !selected.has(row.id);
			for (const item of rows.slice(from, to + 1)) {
				if (value) selected.add(item.id);
				else selected.delete(item.id);
			}
		} else if (selected.has(row.id)) {
			selected.delete(row.id);
		} else {
			selected.add(row.id);
		}
		anchor = index;
	}

	function toggleAll() {
		if (allSelected) selected.clear();
		else for (const row of rows) selected.add(row.id);
		anchor = null;
	}

	function clearSelection() {
		selected.clear();
		anchor = null;
	}

	/** Куди переносити вибране: не в самих себе й не в своїх нащадків. */
	const moveTargets = $derived.by(() => {
		const inside = (id: string) => {
			let current: Row | undefined = byId.get(id);
			for (let depth = 0; current && depth < 20; depth += 1) {
				if (selected.has(current.id)) return true;
				current = current.parentId ? byId.get(current.parentId) : undefined;
			}
			return false;
		};
		return data.categories.filter((row) => row.depth < MAX_DEPTH && !inside(row.id));
	});

	/** Масова дія на сервері; після неї — свіжі дані й чистий вибір. */
	async function runBulk(action: 'bulkDelete' | 'bulkMove', extra: Record<string, string> = {}) {
		if (dirty) {
			toast.error('Спершу збережіть або скасуйте новий порядок');
			return;
		}
		bulkBusy = true;
		const result = await postAction(`/categories?/${action}`, {
			ids: selectedRows.map((row) => row.id),
			...extra
		});
		bulkBusy = false;

		if (result.type === 'failure') {
			toast.error(String(result.data?.message ?? 'Не вдалося виконати'));
			return;
		}
		if (result.type !== 'success') {
			toast.error('Не вдалося виконати — перевірте звʼязок');
			return;
		}

		const done = result.data ?? {};
		if (action === 'bulkDelete') toast.message(`Видалено категорій: ${done.deleted}.`);
		else if (action === 'bulkMove') {
			toast.success('Категорії перенесено', {
				subject: extra.parentId === ROOT ? 'Верхній рівень' : pathOf(extra.parentId),
				description: ' — підкатегорії переїхали разом із ними'
			});
		}

		clearSelection();
		await invalidateAll();
	}

	function openCreate() {
		draft = { id: '', name: '', slug: '', parentId: ROOT, imageUrl: '' };
		open = true;
	}

	function openEdit(row: Row) {
		draft = {
			id: row.id,
			name: row.name,
			slug: row.slug,
			parentId: row.parentId ?? ROOT,
			imageUrl: row.imageUrl ?? ''
		};
		open = true;
	}

	/** Сусіди рядка — серед них і тільки серед них його можна переставити. */
	function siblingIds(parentId: string | null): string[] {
		return rows.filter((row) => row.parentId === parentId).map((row) => row.id);
	}

	/** Рядок їде разом із тим, кого тягнуть: сам він або його нащадок. */
	function isMoving(row: Row): boolean {
		if (!drag) return false;
		let current: Row | undefined = row;
		for (let depth = 0; current && depth < 20; depth += 1) {
			if (current.id === drag.id) return true;
			current = current.parentId ? byId.get(current.parentId) : undefined;
		}
		return false;
	}

	function startDrag(event: PointerEvent, row: Row) {
		if (event.button !== 0) return;
		event.preventDefault();
		const handle = event.currentTarget as HTMLElement;
		handle.setPointerCapture(event.pointerId);
		scroller = handle.closest('main');
		drag = {
			id: row.id,
			parentId: row.parentId,
			startY: event.clientY,
			startScroll: scroller?.scrollTop ?? 0,
			dy: 0
		};
		drop = null;
	}

	function moveDrag(event: PointerEvent) {
		if (!drag) return;

		// Біля верхнього чи нижнього краю — підкручуємо список.
		if (scroller) {
			const box = scroller.getBoundingClientRect();
			if (event.clientY < box.top + 48) scroller.scrollBy(0, -12);
			else if (event.clientY > box.bottom - 48) scroller.scrollBy(0, 12);
		}
		drag.dy = event.clientY - drag.startY + ((scroller?.scrollTop ?? 0) - drag.startScroll);

		// Під вказівником — рядок-сусід? Верхня половина — стаємо перед ним,
		// нижня — після. Над чужим рядком лишаємо попередню ціль.
		for (const line of document.querySelectorAll<HTMLElement>('[data-row-id]')) {
			const id = line.dataset.rowId ?? '';
			if (id === drag.id || (line.dataset.parentId || null) !== drag.parentId) continue;
			const box = line.getBoundingClientRect();
			if (event.clientY >= box.top && event.clientY <= box.bottom) {
				drop = { id, after: event.clientY > box.top + box.height / 2 };
				break;
			}
		}
	}

	function endDrag() {
		const from = drag;
		const target = drop;
		drag = null;
		drop = null;
		scroller = null;
		if (!from || !target) return;

		const siblings = siblingIds(from.parentId);
		const ids = moveWithin(siblings, from.id, target.id, target.after);
		if (ids.join() !== siblings.join()) setOrder(from.parentId, ids, from.id);
	}

	function cancelDrag() {
		drag = null;
		drop = null;
		scroller = null;
	}

	/** З клавіатури: фокус на ручці, стрілки ↑/↓ — на крок серед сусідів. */
	function moveByKey(event: KeyboardEvent, row: Row) {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const siblings = siblingIds(row.parentId);
		const index = siblings.indexOf(row.id);
		const neighbour = siblings[event.key === 'ArrowUp' ? index - 1 : index + 1];
		if (!neighbour) return;
		setOrder(
			row.parentId,
			moveWithin(siblings, row.id, neighbour, event.key === 'ArrowDown'),
			row.id
		);
	}

	/** Лише в чернетку — база поки не знає. `id` — кого саме перенесли. */
	function setOrder(parentId: string | null, ids: string[], id: string) {
		reordered[parentId ?? ROOT] = ids;
		movedIds.add(id);
	}

	function discardOrder() {
		reordered = {};
		movedIds.clear();
	}

	/**
	 * Хто з перенесених справді стоїть не на своєму місці — ті рядки сірі,
	 * поки порядок не збережуть. Повернули назад — підсвітка зникає.
	 */
	const movedIds = new SvelteSet<string>();

	const savedIndex = $derived(siblingIndex(data.categories));
	const draftIndex = $derived(siblingIndex(rows));
	const isMoved = (id: string) => movedIds.has(id) && savedIndex.get(id) !== draftIndex.get(id);

	/**
	 * «Зберегти»: кожен змінений ряд — однією транзакцією на сервері. Чернетку
	 * знімаємо вже після свіжих даних, щоб рядки не стрибнули назад.
	 */
	async function saveOrder() {
		if (!dirty || savingOrder) return;
		savingOrder = true;

		let failed = '';
		for (const [parent, ids] of changedGroups) {
			const result = await postAction('/categories?/reorder', { parentId: parent, ids });
			if (result.type === 'failure') {
				failed = String(result.data?.message ?? 'Не вдалося змінити порядок');
			} else if (result.type === 'error') {
				failed = 'Не вдалося змінити порядок — перевірте звʼязок';
			}
			if (failed) break;
		}

		await invalidateAll();
		reordered = {};
		movedIds.clear();
		savingOrder = false;
		if (failed) toast.error(failed);
		else toast.success('Порядок збережено', { description: 'Меню сайту оновиться саме' });
	}

	// Незбережений порядок не губимо мовчки: перехід або закриття вкладки —
	// спершу питаємо.
	beforeNavigate(({ cancel, type }) => {
		if (!dirty || savingOrder) return;
		if (type === 'leave') {
			cancel();
			return;
		}
		if (!confirm('Новий порядок категорій не збережено. Піти без збереження?')) cancel();
	});

	/** Esc посеред перетягування вже скасовує кидок; Ctrl S — зберегти. */
	function onkeydown(event: KeyboardEvent) {
		// Esc знімає вибір — якщо не відкрита картка й нічого не тягнуть.
		if (event.key === 'Escape' && selected.size > 0 && !open && !drag) {
			clearSelection();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && dirty) {
			event.preventDefault();
			saveOrder();
		}
	}

	/** «1 товар» — лише число; нуль сірим, щоб не відволікав. */
	const muted = (count: number) => (count === 0 ? 'text-muted-foreground/50' : '');
</script>

<svelte:head><title>Категорії — CRM LILY LOOK</title></svelte:head>

{#snippet checkbox(
	checked: boolean,
	mixed: boolean,
	onclick: (event: MouseEvent) => void,
	label: string
)}
	<button
		type="button"
		role="checkbox"
		aria-checked={mixed ? 'mixed' : checked}
		aria-label={label}
		class="flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors {checked ||
		mixed
			? 'border-primary bg-primary text-primary-foreground'
			: 'border-foreground/30 bg-card hover:border-foreground/60'}"
		{onclick}
	>
		{#if checked}
			<Check size={11} strokeWidth={3} />
		{:else if mixed}
			<Minus size={11} strokeWidth={3} />
		{/if}
	</button>
{/snippet}

<svelte:window {onkeydown} />

<div class="flex flex-col gap-2 pb-6">
	<div class="flex h-8 items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Категорії</h1>
		<span class="text-[17px] font-semibold tracking-tight text-muted-foreground/50">
			{data.total}
		</span>
	</div>

	<div class="flex flex-wrap items-center gap-1.5">
		{#if dirty}
			<p
				class="flex items-center gap-1.5 text-[12px] font-medium text-amber-600 dark:text-amber-400"
			>
				<span class="size-1.5 rounded-full bg-current"></span>
				Порядок змінено — збережіть, щоб він потрапив на сайт.
			</p>
			<!-- Поки є незбережений порядок, на місці «+ Категорія» — «Скасувати» й «Зберегти». -->
			<div class="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					class="h-6 rounded-[6px] px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
					disabled={savingOrder}
					onclick={discardOrder}
				>
					Скасувати
				</button>
				<button
					type="button"
					class="flex h-6 items-center gap-1 rounded-[6px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					disabled={savingOrder}
					onclick={saveOrder}
				>
					{#if savingOrder}<Spinner class="size-3.5" />{:else}<Check size={14} />{/if}
					Зберегти
				</button>
			</div>
		{:else}
			<p class="text-[12px] text-muted-foreground">
				Порядок — як у меню сайту. Тягніть за ручку ліворуч, щоб переставити.
			</p>
			<button
				type="button"
				class="ml-auto flex h-6 items-center gap-1 rounded-[6px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
				onclick={openCreate}
			>
				<Plus size={14} />
				Категорія
			</button>
		{/if}
	</div>

	{#if rows.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-block px-6 py-16 text-center">
			<FolderTree size={28} class="text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				Категорій ще немає — без них товар нікуди покласти.
			</p>
			<Button variant="outline" class="rounded-full" onclick={openCreate}>
				<Plus size={16} />
				Створити першу
			</Button>
		</div>
	{:else}
		<!-- Таблиця притиснута до країв панелі, як замовлення й товари. -->
		<div class="-mr-2 -ml-3 overflow-x-auto">
			<div class="min-w-172.5 {table}" role="table" aria-label="Категорії">
				<div class="{headRow} {columns}" role="row">
					<div class="{cell} justify-end pr-1.5" role="columnheader">
						{@render checkbox(
							allSelected,
							selectedRows.length > 0 && !allSelected,
							toggleAll,
							allSelected ? 'Зняти вибір з усіх' : 'Вибрати всі'
						)}
					</div>
					{#each HEADERS as header (header)}
						<div class={cell} role="columnheader">{header}</div>
					{/each}
				</div>

				{#each rows as row, index (row.id)}
					{@const moving = isMoving(row)}
					{@const target = drop?.id === row.id ? drop : null}
					<!-- Рядок, який тягнуть (разом із підкатегоріями), їде за вказівником
					     над рештою; лінія кольору теми показує, куди він ляже. -->
					<div
						data-row-id={row.id}
						data-parent-id={row.parentId ?? ''}
						class="group/row {row34} {columns} {selected.has(row.id)
							? 'bg-primary/6 hover:bg-primary/8'
							: isMoved(row.id)
								? 'bg-foreground/7 hover:bg-foreground/9'
								: ''} {moving ? 'relative z-10 bg-card shadow-lg ring-1 ring-border' : ''} {target
							? target.after
								? 'shadow-[inset_0_-2px_0_var(--color-primary)]'
								: 'shadow-[inset_0_2px_0_var(--color-primary)]'
							: ''}"
						style:transform={moving && drag ? `translateY(${drag.dy}px)` : undefined}
						role="row"
					>
						<!-- Ручка: тягнеш за неї — переставляєш категорію серед сусідів.
						     Підкатегорії їдуть разом із нею. -->
						<!-- Ліворуч ручка (видно під курсором), праворуч — номер, що під
						     курсором чи під час вибору стає чекбоксом. -->
						<span class="{cell} justify-between gap-0 pr-1.5 pl-0.5" role="cell">
							<span
								role="button"
								tabindex="0"
								aria-label="Перетягнути «{row.name}». Стрілки вгору й вниз — переставити"
								title="Перетягніть, щоб змінити порядок"
								class="flex h-5 w-3.5 cursor-grab touch-none items-center justify-center rounded-[4px] text-muted-foreground/60 opacity-0 transition outline-none select-none group-hover/row:opacity-100 hover:bg-foreground/8 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing {drag?.id ===
								row.id
									? 'cursor-grabbing bg-foreground/8 text-foreground opacity-100'
									: ''}"
								onpointerdown={(event) => startDrag(event, row)}
								onpointermove={moveDrag}
								onpointerup={endDrag}
								onpointercancel={cancelDrag}
								onkeydown={(event) => {
									if (event.key === 'Escape') cancelDrag();
									else moveByKey(event, row);
								}}
							>
								<GripVertical size={12} />
							</span>

							{#if selected.size > 0}
								{@render checkbox(
									selected.has(row.id),
									false,
									(event) => toggleRow(index, event.shiftKey),
									`Вибрати «${row.name}»`
								)}
							{:else}
								<span class="relative flex size-4 items-center justify-center">
									<span
										class="text-[12px] text-muted-foreground tabular-nums group-hover/row:invisible"
									>
										{index + 1}
									</span>
									<span class="invisible absolute inset-0 group-hover/row:visible">
										{@render checkbox(
											false,
											false,
											(event) => toggleRow(index, event.shiftKey),
											`Вибрати «${row.name}»`
										)}
									</span>
								</span>
							{/if}
						</span>

						<!-- Решта рядка — одна кнопка: клік відкриває картку категорії. -->
						<button
							type="button"
							class="col-span-4 grid grid-cols-subgrid text-left outline-none focus-visible:bg-foreground/5"
							onclick={() => openEdit(row)}
						>
							<span class="{cell} gap-2" role="cell">
								{#if row.depth > 0}
									<span class="flex shrink-0 justify-end" style:width="{row.depth * 20}px">
										<CornerDownRight size={13} class="text-muted-foreground/50" />
									</span>
								{/if}
								{#if row.imageUrl}
									<img
										src={cloudinaryThumb(row.imageUrl, 48)}
										alt=""
										class="size-6 shrink-0 rounded-[6px] object-cover"
									/>
								{:else}
									<span
										class="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-foreground/6 text-muted-foreground/60"
									>
										<FolderTree size={12} />
									</span>
								{/if}
								<span class="truncate {row.depth === 0 ? 'font-semibold' : 'font-medium'}">
									{row.name}
								</span>
							</span>
							<span class="{cell} font-mono text-[12px] text-muted-foreground" role="cell">
								<span class="truncate">/catalog/{row.slug}</span>
							</span>
							<span class="{cell} tabular-nums {muted(row.productCount)}" role="cell">
								{row.productCount}
							</span>
							<span class="{cell} tabular-nums {muted(row.childCount)}" role="cell">
								{row.childCount}
							</span>
						</button>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<CategoryDialog bind:open bind:draft {parentOptions} {pathOf} />

{#if selectedRows.length > 0}
	<SelectionBar
		count={selectedRows.length}
		busy={bulkBusy}
		{moveTargets}
		{pathOf}
		onclear={clearSelection}
		onmove={(parentId) => runBulk('bulkMove', { parentId })}
		ondelete={() => runBulk('bulkDelete')}
	/>
{/if}
