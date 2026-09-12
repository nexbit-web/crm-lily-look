<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { navigating, page as pageState } from '$app/state';
	import { Plus, ImageOff, Search, X } from '@lucide/svelte';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { formatUah } from '$lib/money';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Знімок: далі поле живе своїм життям, поки менеджер друкує.
	let search = $state(untrack(() => data.query));

	const SORT_LABELS: Record<string, string> = {
		created: 'Спочатку нові',
		name: 'За назвою',
		'price-asc': 'Ціна: спершу дешеві',
		'price-desc': 'Ціна: спершу дорогі'
	};

	// Спінер показуємо лише коли перезавантажується саме цей список.
	const loading = $derived(navigating.to?.url.pathname === '/products');
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));

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

<div class="space-y-6">
	<div class="flex flex-wrap items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Товари</h1>
		<Badge variant="secondary">{data.total}</Badge>

		<Button href="/products/new" class="ml-auto">
			<Plus size={16} />
			Додати товар
		</Button>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<form
			class="relative flex-1 sm:max-w-xs"
			onsubmit={(event) => {
				event.preventDefault();
				navigate({ q: search });
			}}
		>
			<Search
				size={16}
				class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input bind:value={search} placeholder="Назва, адреса або SKU" class="pl-8" />
			{#if data.query}
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="absolute top-1/2 right-1 size-7 -translate-y-1/2"
					aria-label="Очистити пошук"
					onclick={() => {
						search = '';
						navigate({ q: null });
					}}
				>
					<X size={14} />
				</Button>
			{/if}
		</form>

		<Select.Root
			type="single"
			value={data.sort}
			onValueChange={(value) => navigate({ sort: value })}
		>
			<Select.Trigger class="h-9 w-50">{SORT_LABELS[data.sort]}</Select.Trigger>
			<Select.Content>
				{#each Object.entries(SORT_LABELS) as [value, label] (value)}
					<Select.Item {value} {label}>{label}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>

		{#if loading}
			<span class="flex items-center gap-2 text-xs text-muted-foreground">
				<Spinner />
				Завантаження…
			</span>
		{/if}
	</div>

	{#if data.products.length === 0}
		<div class="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
			{#if data.query}
				<p class="text-sm">За запитом «{data.query}» нічого не знайшлось.</p>
				<Button
					variant="outline"
					class="mt-4"
					onclick={() => {
						search = '';
						navigate({ q: null });
					}}
				>
					Скинути пошук
				</Button>
			{:else}
				<p class="text-sm">Товарів ще немає.</p>
				<Button href="/products/new" variant="outline" class="mt-4">
					<Plus size={16} />
					Додати перший
				</Button>
			{/if}
		</div>
	{:else}
		<div class="relative overflow-x-auto rounded-xl border">
			{#if loading}
				<div class="absolute inset-0 z-10 flex items-start justify-center bg-background/60 pt-16">
					<Spinner class="size-6" />
				</div>
			{/if}

			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-16">Фото</Table.Head>
						<Table.Head>Назва</Table.Head>
						<Table.Head>Категорія</Table.Head>
						<Table.Head class="text-right">Ціна</Table.Head>
						<Table.Head class="text-right">Кількість</Table.Head>
						<Table.Head>Статус</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.products as product (product.id)}
						<!-- Клік по рядку веде на товар, але клік по назві лишаємо
						     посиланню. Гасити подію на самому <a> не можна: роутер
						     SvelteKit слухає клік на document, і зупинка спливання
						     змушувала браузер перезавантажити сторінку замість переходу. -->
						<Table.Row
							class="cursor-pointer hover:bg-muted/50"
							onclick={(event) => {
								if (event.target instanceof Element && event.target.closest('a')) return;
								goto(`/products/${product.id}`);
							}}
						>
							<Table.Cell>
								{#if product.image}
									<img
										src={cloudinaryThumb(product.image.url, 48)}
										alt={product.image.alt ?? product.name}
										class="size-12 rounded-md object-cover"
										loading="lazy"
									/>
								{:else}
									<div
										class="flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground"
									>
										<ImageOff size={16} />
									</div>
								{/if}
							</Table.Cell>

							<Table.Cell>
								<a href={`/products/${product.id}`} class="font-medium hover:underline">
									{product.name}
								</a>
								<p class="text-xs text-muted-foreground">/{product.slug}</p>
							</Table.Cell>

							<Table.Cell class="text-sm">{product.categoryName}</Table.Cell>

							<Table.Cell class="text-right whitespace-nowrap">
								{#if product.finalPrice > 0 && product.finalPrice < product.price}
									<span class="text-xs text-muted-foreground line-through">
										{formatUah(product.price)}
									</span>
									<span class="ml-1 font-medium">{formatUah(product.finalPrice)}</span>
								{:else}
									<span class="font-medium">{formatUah(product.price)}</span>
								{/if}
							</Table.Cell>

							<Table.Cell class="text-right">
								<span class={product.stock === 0 ? 'font-medium text-destructive' : ''}>
									{product.stock}
								</span>
								<span class="text-xs text-muted-foreground"> / {product.variantCount} розм.</span>
							</Table.Cell>

							<Table.Cell>
								<div class="flex flex-wrap gap-1">
									{#if product.isActive}
										<Badge variant="secondary">Активний</Badge>
									{:else}
										<Badge variant="outline">Схований</Badge>
									{/if}
									{#if product.isFeatured}
										<Badge>Топ</Badge>
									{/if}
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<div class="flex flex-wrap items-center justify-between gap-3">
			<p class="text-xs text-muted-foreground">
				Показано {from}–{to} з {data.total}
			</p>

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
							<Pagination.Item>
								<Pagination.PrevButton />
							</Pagination.Item>
							{#each pages as pageItem (pageItem.key)}
								{#if pageItem.type === 'ellipsis'}
									<Pagination.Item>
										<Pagination.Ellipsis />
									</Pagination.Item>
								{:else}
									<Pagination.Item>
										<Pagination.Link page={pageItem} isActive={currentPage === pageItem.value}>
											{pageItem.value}
										</Pagination.Link>
									</Pagination.Item>
								{/if}
							{/each}
							<Pagination.Item>
								<Pagination.NextButton />
							</Pagination.Item>
						</Pagination.Content>
					{/snippet}
				</Pagination.Root>
			{/if}
		</div>
	{/if}
</div>
