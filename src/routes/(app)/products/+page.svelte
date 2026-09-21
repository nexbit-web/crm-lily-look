<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { navigating, page as pageState } from '$app/state';
	import { Plus, ImageOff, Search, X, Shirt, Check } from '@lucide/svelte';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { formatUah } from '$lib/money';
	import { cloudinaryThumb, cloudinarySrcset } from '$lib/cloudinary-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Знімок: далі поле живе своїм життям, поки менеджер друкує.
	let search = $state(untrack(() => data.query));

	// Короткі підписи: чипси читаються з одного погляду, на відміну від
	// випадайки, яка ховає і вибір, і решту варіантів.
	const SORTS: { key: string; label: string }[] = [
		{ key: 'created', label: 'Найновіші' },
		{ key: 'name', label: 'За назвою' },
		{ key: 'price-asc', label: 'Дешевші' },
		{ key: 'price-desc', label: 'Дорожчі' }
	];

	/** Мініатюра в рядку — 40 CSS-пікселів. */
	const THUMB = 40;

	const loading = $derived(navigating.to?.url.pathname === '/products');
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));
	const allCount = $derived(
		data.categories.reduce((sum, item) => sum + (item.isChild ? 0 : item.count), 0)
	);
	const categoryLabel = $derived(
		data.category
			? (data.categories.find((item) => item.id === data.category)?.name ?? 'Категорія')
			: 'Усі категорії'
	);

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

	function clearSearch() {
		search = '';
		if (data.query) navigate({ q: null });
	}
</script>

<svelte:head><title>Товари — CRM LILY LOOK</title></svelte:head>

{#snippet chip(label: string, active: boolean, onclick: () => void)}
	<!-- Вибране — синя заливка з білою галочкою поряд із текстом. -->
	<button
		type="button"
		aria-pressed={active}
		class="flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors {active
			? 'bg-primary text-primary-foreground'
			: 'bg-muted/60 text-muted-foreground hover:text-foreground'}"
		{onclick}
	>
		{#if active}
			<!-- Колір не задаємо: галочка успадковує білий текст кнопки. -->
			<Check size={13} strokeWidth={2.5} />
		{/if}
		{label}
	</button>
{/snippet}

<div class="space-y-5 pb-12">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Товари</h1>
		<span class="text-2xl font-semibold tracking-tight text-muted-foreground/40">{data.total}</span>
		{#if loading}
			<Spinner class="size-4 text-muted-foreground" />
		{/if}

		<Button href="/products/new" class="ml-auto rounded-xl px-5">
			<Plus size={16} />
			Додати товар
		</Button>
	</div>

	<form
		class="relative"
		onsubmit={(event) => {
			event.preventDefault();
			navigate({ q: search });
		}}
	>
		<Search
			size={16}
			class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/60"
		/>
		<!-- Фокус — рамка 2 px кольору акценту замість тіні: на світлому тлі
		     видно одразу, куди ви друкуєте. -->
		<Input
			bind:value={search}
			placeholder="Назва, адреса або SKU"
			class="h-10 rounded-xl border-0 bg-muted/60 pr-10 pl-9 shadow-none focus-visible:border-transparent focus-visible:ring-[1.5px] focus-visible:ring-primary"
		/>
		{#if search}
			<button
				type="button"
				aria-label="Очистити пошук"
				class="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
				onclick={clearSearch}
			>
				<X size={14} />
			</button>
		{/if}
	</form>

	<div class="flex flex-wrap items-center gap-1.5">
		<!-- Категорій буває багато, тому вони у випадайці зі скролом, а не в
		     рядку чипсів: інакше фільтр займав би пів екрана. -->
		<Select.Root
			type="single"
			value={data.category ?? ''}
			onValueChange={(value) => navigate({ category: value || null })}
		>
			<Select.Trigger
				class="h-[30px] w-auto gap-1.5 rounded-[10px] border-0 bg-muted/60 px-3 text-xs font-medium shadow-none data-[state=open]:bg-muted {data.category
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				{categoryLabel}
			</Select.Trigger>
			<Select.Content class="max-h-50" align="start">
				<Select.Item value="" label="Усі категорії">
					Усі категорії
					<span class="ml-auto text-muted-foreground tabular-nums">{allCount}</span>
				</Select.Item>
				{#each data.categories as item (item.id)}
					<Select.Item value={item.id} label={item.name} class={item.isChild ? 'pl-5' : ''}>
						{item.name}
						<span class="ml-auto text-muted-foreground tabular-nums">{item.count}</span>
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		{#each SORTS as option (option.key)}
			{@render chip(option.label, data.sort === option.key, () => navigate({ sort: option.key }))}
		{/each}
	</div>

	{#if data.products.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-muted/50 px-6 py-16 text-center">
			<Shirt size={28} class="text-muted-foreground/40" />
			{#if data.query || data.category}
				<p class="text-sm text-muted-foreground">За цим фільтром нічого не знайшлось.</p>
				<Button
					variant="ghost"
					class="rounded-full text-primary hover:text-primary"
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
		<div class="overflow-hidden rounded-[14px]">
			<div class="row head text-xs text-muted-foreground">
				<span>Товар</span>
				<span class="col-category">Категорія</span>
				<span class="text-right">Ціна</span>
				<span class="col-stock text-right">Залишок</span>
			</div>

			<div class="body">
				{#each data.products as product (product.id)}
					{@const discounted = product.finalPrice > 0 && product.finalPrice < product.price}
					<!-- Рядок цілком — посилання, а не <tr> з onclick: працюють середня
					     кнопка, «відкрити в новій вкладці» й прелоад на ховер, і не
					     потрібен жоден обробник у JS. -->
					<a
						href="/products/{product.id}"
						class="row outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
					>
						<span class="flex min-w-0 items-center gap-3">
							{#if product.imageUrl}
								<img
									src={cloudinaryThumb(product.imageUrl, THUMB)}
									srcset={cloudinarySrcset(product.imageUrl, THUMB)}
									alt=""
									width={THUMB}
									height={THUMB}
									loading="lazy"
									decoding="async"
									class="size-10 shrink-0 rounded-lg bg-foreground/5 object-cover"
								/>
							{:else}
								<span
									class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground/50"
								>
									<ImageOff size={15} />
								</span>
							{/if}
							<span class="truncate text-sm {product.isActive ? '' : 'text-muted-foreground'}">
								{product.name}
							</span>
						</span>

						<span class="col-category truncate text-sm text-muted-foreground">
							{product.categoryName}
						</span>

						<span class="text-right text-sm tabular-nums">
							{#if discounted}
								<span class="text-xs text-muted-foreground line-through">
									{formatUah(product.price)}
								</span>
								<br />
							{/if}
							{formatUah(discounted ? product.finalPrice : product.price)}
						</span>

						<span
							class="col-stock text-right text-sm tabular-nums {product.stock === 0
								? 'text-destructive'
								: 'text-muted-foreground'}"
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

<style>
	/* Список як у Finder: колонки однієї ширини в шапці й рядках, смужки
	   через рядок і жодних рамок. Сітка живе тут, а не в класах Tailwind,
	   щоб шапка й рядок не могли розʼїхатись через правку в одному місці. */
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 6.5rem 5.5rem;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 0.75rem;
	}

	.col-category {
		display: none;
	}

	@media (min-width: 880px) {
		.row {
			grid-template-columns: minmax(0, 1fr) 11rem 7rem 6rem;
		}
		.col-category {
			display: block;
		}
	}

	.head {
		padding-bottom: 0.4rem;
		border-bottom: 1px solid var(--border);
	}

	/* Роздільники між заголовками колонок — як у Finder. */
	.head > span + span {
		border-left: 1px solid var(--border);
		padding-left: 0.75rem;
		margin-left: -0.75rem;
	}

	.body > :global(a:nth-child(odd)) {
		background: color-mix(in oklab, var(--muted) 45%, transparent);
	}

	.body > :global(a:hover) {
		background: color-mix(in oklab, var(--primary) 8%, transparent);
	}
</style>
