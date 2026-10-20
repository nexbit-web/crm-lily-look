<script lang="ts">
	import { untrack, type Component } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { navigating, page as pageState } from '$app/state';
	import {
		ArrowDownAZ,
		ArrowDownNarrowWide,
		ArrowUpNarrowWide,
		Check,
		ChevronDown,
		Clock,
		Eye,
		EyeOff,
		FolderTree,
		ImageOff,
		ListFilter,
		Plus,
		Shirt
	} from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import ExpandSearch from '$lib/components/expand-search.svelte';
	import { formatUah } from '$lib/money';
	import { cloudinaryThumb, cloudinarySrcset } from '$lib/cloudinary-url';
	import {
		badge,
		bodyRow,
		cell,
		headRow,
		menu,
		menuItem,
		pill,
		pillActive,
		table
	} from '$lib/table';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

	// Знімок: далі поле живе своїм життям, поки менеджер друкує.
	let search = $state(untrack(() => data.query));

	const SORTS: { key: string; label: string; icon: Component }[] = [
		{ key: 'created', label: 'Найновіші', icon: Clock },
		{ key: 'name', label: 'За назвою', icon: ArrowDownAZ },
		{ key: 'price-asc', label: 'Дешевші', icon: ArrowUpNarrowWide },
		{ key: 'price-desc', label: 'Дорожчі', icon: ArrowDownNarrowWide }
	];

	/** Мініатюра в рядку — 28 CSS-пікселів: рядок компактний, 36 px. */
	const THUMB = 28;

	/** Колонки таблиці: однакові для шапки й рядків. Перша — порядковий номер. */
	const columns = 'grid-cols-[40px_minmax(220px,1.4fr)_minmax(140px,1fr)_130px_200px_110px]';
	const HEADERS = ['Товар', 'Категорія', 'На сайті', 'Ціна', 'Залишок'];

	const loading = $derived(navigating.to?.url.pathname === '/products');
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));
	const allCount = $derived(
		data.categories.reduce((sum, item) => sum + (item.isChild ? 0 : item.count), 0)
	);
	const categoryLabel = $derived(
		data.category
			? (data.categories.find((item) => item.id === data.category)?.name ?? 'Категорія')
			: 'Усі'
	);
	const sortLabel = $derived(SORTS.find((item) => item.key === data.sort)?.label ?? 'Найновіші');

	/** Змінює один параметр URL, зберігаючи решту; сторінку скидає на першу. */
	function navigate(changes: Record<string, string | null>, resetPage = true) {
		const params = new SvelteURLSearchParams(pageState.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === '') params.delete(key);
			else params.set(key, value);
		}
		if (resetPage) params.delete('page');
		const qs = params.toString();
		goto(qs ? `/products?${qs}` : '/products', { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head><title>Товари — CRM LILY LOOK</title></svelte:head>

<!-- Список у стилі ClickUp, як і замовлення: заголовок, рядок кнопок-пілюль,
     таблиця на всю ширину. Рядок — посилання на сторінку товару. -->
<div class="flex flex-col gap-2 pb-6">
	<div class="flex h-8 items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Товари</h1>
		<span class="text-[17px] font-semibold tracking-tight text-muted-foreground/50">
			{data.total}
		</span>
		{#if loading}
			<Spinner class="size-3.5 text-muted-foreground" />
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-1.5">
		<!-- Категорій буває багато — у меню зі скролом; підкатегорії з відступом. -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button {...props} type="button" class={data.category ? pillActive : pill}>
						<FolderTree size={13} />
						Категорія: {categoryLabel}
						<ChevronDown size={12} class="opacity-60" />
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="{menu} max-h-80 w-56">
				<DropdownMenu.Item class={menuItem} onSelect={() => navigate({ category: null })}>
					<FolderTree size={15} class="shrink-0 text-muted-foreground" />
					Усі
					<span class="ml-auto text-xs text-muted-foreground tabular-nums">{allCount}</span>
					<Check
						size={13}
						strokeWidth={2.5}
						class="shrink-0 {data.category ? 'invisible' : 'text-foreground'}"
					/>
				</DropdownMenu.Item>
				{#each data.categories as item (item.id)}
					<DropdownMenu.Item
						class="{menuItem} {item.isChild ? 'pl-8' : ''}"
						onSelect={() => navigate({ category: item.id })}
					>
						<span class="truncate">{item.name}</span>
						<span class="ml-auto text-xs text-muted-foreground tabular-nums">{item.count}</span>
						<Check
							size={13}
							strokeWidth={2.5}
							class="shrink-0 {data.category === item.id ? 'text-foreground' : 'invisible'}"
						/>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button {...props} type="button" class={data.sort === 'created' ? pill : pillActive}>
						<ListFilter size={13} />
						Сортування: {sortLabel}
						<ChevronDown size={12} class="opacity-60" />
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class={menu}>
				{#each SORTS as option (option.key)}
					<DropdownMenu.Item class={menuItem} onSelect={() => navigate({ sort: option.key })}>
						<option.icon size={15} class="shrink-0 text-muted-foreground" />
						{option.label}
						<Check
							size={13}
							strokeWidth={2.5}
							class="ml-auto shrink-0 {data.sort === option.key ? 'text-foreground' : 'invisible'}"
						/>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<div class="ml-auto flex items-center gap-1.5">
			<ExpandSearch
				bind:value={search}
				applied={data.query}
				label="Пошук товару"
				placeholder="Назва, адреса або SKU"
				onsearch={(query) => navigate({ q: query || null })}
			/>
			<a
				href="/products/new"
				class="flex h-6 items-center gap-1 rounded-[6px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
			>
				<Plus size={14} />
				Додати товар
			</a>
		</div>
	</div>

	{#if data.products.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-block px-6 py-16 text-center">
			<Shirt size={28} class="text-muted-foreground/40" />
			{#if data.query || data.category}
				<p class="text-sm text-muted-foreground">За цим фільтром нічого не знайшлось.</p>
				<Button
					variant="ghost"
					class="rounded-full"
					onclick={() => {
						search = '';
						navigate({ q: null, category: null });
					}}
				>
					Скинути фільтри
				</Button>
			{:else}
				<p class="text-sm text-muted-foreground">Товарів ще немає.</p>
				<Button href="/products/new" class="rounded-xl px-5">
					<Plus size={16} />
					Додати перший
				</Button>
			{/if}
		</div>
	{:else}
		<!-- Таблиця виходить за відступи сторінки й притискається до країв
		     панелі. На вузькому екрані гортається вбік — колонки не стискаються. -->
		<div class="-mr-2 -ml-3 overflow-x-auto">
			<div class="min-w-210 {table}" role="table" aria-label="Товари">
				<div class="{headRow} {columns}" role="row">
					<div class="{cell} justify-center" role="columnheader">#</div>
					{#each HEADERS as header (header)}
						<div class={cell} role="columnheader">{header}</div>
					{/each}
				</div>

				{#each data.products as product, index (product.id)}
					{@const discounted = product.finalPrice > 0 && product.finalPrice < product.price}
					<!-- Рядок цілком — посилання: працюють середня кнопка, «відкрити в
					     новій вкладці» й прелоад на ховер, без жодного JS. -->
					<a href="/products/{product.id}" class="{bodyRow} {columns}" role="row">
						<span
							class="{cell} justify-center text-[13px] text-muted-foreground tabular-nums"
							role="cell"
						>
							{(data.page - 1) * data.perPage + index + 1}
						</span>

						<span class="{cell} gap-2.5" role="cell">
							{#if product.imageUrl}
								<img
									src={cloudinaryThumb(product.imageUrl, THUMB)}
									srcset={cloudinarySrcset(product.imageUrl, THUMB)}
									alt=""
									width={THUMB}
									height={THUMB}
									loading="lazy"
									decoding="async"
									class="size-7 shrink-0 rounded-[6px] bg-foreground/5 object-cover"
								/>
							{:else}
								<span
									class="flex size-7 shrink-0 items-center justify-center rounded-[6px] bg-foreground/5 text-muted-foreground/50"
								>
									<ImageOff size={13} />
								</span>
							{/if}
							<span class="truncate font-medium">{product.name}</span>
						</span>

						<span class="{cell} text-muted-foreground" role="cell">
							<span class="truncate">{product.categoryName}</span>
						</span>

						<!-- Чи бачать товар покупці — без заходу в картку товару -->
						<span class={cell} role="cell">
							{#if product.isActive}
								<span class="{badge} bg-emerald-500 text-white">
									<Eye size={12} strokeWidth={2.5} />
									На сайті
								</span>
							{:else}
								<span class="{badge} bg-foreground/10 text-muted-foreground">
									<EyeOff size={12} strokeWidth={2.5} />
									Приховано
								</span>
							{/if}
						</span>

						<span class="{cell} gap-1.5 tabular-nums" role="cell">
							<span class="font-medium">
								{formatUah(discounted ? product.finalPrice : product.price)}
							</span>
							{#if discounted}
								<span class="text-xs text-muted-foreground line-through">
									{formatUah(product.price)}
								</span>
							{/if}
						</span>

						<span
							class="{cell} tabular-nums {product.stock === 0
								? 'text-destructive'
								: 'text-muted-foreground'}"
							role="cell"
						>
							{product.stock === 0 ? 'Немає' : `${product.stock} шт`}
						</span>
					</a>
				{/each}
			</div>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-xs text-muted-foreground">Показано {from}–{to} з {data.total}</p>

			{#if data.pageCount > 1}
				<Pagination.Root
					count={data.total}
					perPage={data.perPage}
					page={data.page}
					onPageChange={(value) => navigate({ page: String(value) }, false)}
					class="mx-0 w-auto justify-end"
				>
					{#snippet children({ pages, currentPage })}
						<Pagination.Content>
							<Pagination.Item><Pagination.PrevButton /></Pagination.Item>
							{#each pages as pageItem (pageItem.key)}
								{#if pageItem.type === 'ellipsis'}
									<Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
								{:else}
									<Pagination.Item>
										<Pagination.Link page={pageItem} isActive={currentPage === pageItem.value}>
											{pageItem.value}
										</Pagination.Link>
									</Pagination.Item>
								{/if}
							{/each}
							<Pagination.Item><Pagination.NextButton /></Pagination.Item>
						</Pagination.Content>
					{/snippet}
				</Pagination.Root>
			{/if}
		</div>
	{/if}
</div>
