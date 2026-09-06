<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import { navigating, page as pageState } from '$app/state';
	import toast from 'svelte-hot-french-toast';
	import { Search, X, Check, ChevronRight, ImageOff, Package } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { formatUah } from '$lib/money';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import {
		ORDER_STATUSES,
		PAYMENT_STATUSES,
		STATUS_LABELS,
		STATUS_DOTS,
		PAYMENT_LABELS,
		DELIVERY_LABELS,
		type OrderStatusKey,
		type DeliveryMethodKey
	} from '$lib/orders';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Order = (typeof data.orders)[number];

	// Знімок: далі поле живе своїм життям, поки менеджер друкує.
	let search = $state(untrack(() => data.query));
	let open = $state(false);
	let openId = $state('');
	let openOrder = $state<Order | null>(null);

	const loading = $derived(navigating.to?.url.pathname === '/orders');
	const from = $derived(data.total === 0 ? 0 : (data.page - 1) * data.perPage + 1);
	const to = $derived(Math.min(data.page * data.perPage, data.total));

	// Після зміни статусу список перезавантажується — підтягуємо свіжу версію
	// відкритого замовлення, щоб картка не показувала старе. openOrder тут
	// тільки пишеться, тому циклу не буде.
	$effect(() => {
		const fresh = data.orders.find((order) => order.id === openId);
		if (fresh) openOrder = fresh;
	});

	/** Змінює один параметр URL, зберігаючи решту; сторінку скидає на першу. */
	function navigate(changes: Record<string, string | null>, resetPage = true) {
		const params = new SvelteURLSearchParams(pageState.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null || value === '') params.delete(key);
			else params.set(key, value);
		}
		if (resetPage) params.delete('page');
		const qs = params.toString();
		goto(qs ? `/orders?${qs}` : '/orders', { keepFocus: true, noScroll: true });
	}

	function openOrderCard(order: Order) {
		openId = order.id;
		openOrder = order;
		open = true;
	}

	function when(date: Date | string, withTime = true): string {
		return new Date(date).toLocaleString('uk-UA', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
		});
	}

	/** «1 позиція», «2 позиції», «5 позицій». */
	function itemsLabel(count: number): string {
		const mod10 = count % 10;
		const mod100 = count % 100;
		if (mod10 === 1 && mod100 !== 11) return `${count} позиція`;
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} позиції`;
		return `${count} позицій`;
	}

	/** Спільний обробник для обох дій картки: статус і оплата. */
	const applyChange: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Не вдалося зберегти'));
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Помилка сервера');
			}
			await update({ reset: false });
		};
	};
</script>

<svelte:head><title>Замовлення — CRM LILY LOOK</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-5 pb-12">
	<div class="flex items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Замовлення</h1>
		<span class="text-2xl font-semibold tracking-tight text-muted-foreground/40">{data.total}</span>
		{#if loading}
			<Spinner class="size-4 text-muted-foreground" />
		{/if}
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
		<Input
			bind:value={search}
			placeholder="Номер, імʼя або телефон"
			class="h-10 rounded-full border-0 bg-muted/60 pr-10 pl-9 shadow-none"
		/>
		{#if data.query}
			<button
				type="button"
				aria-label="Очистити пошук"
				class="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/[0.08]"
				onclick={() => {
					search = '';
					navigate({ q: null });
				}}
			>
				<X size={14} />
			</button>
		{/if}
	</form>

	<!-- Чипси зі статусами: скільки чого лежить, видно без відкриття фільтра. -->
	<div class="flex flex-wrap gap-1.5">
		<button
			type="button"
			class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {data.status === null
				? 'bg-foreground text-background'
				: 'bg-muted/60 text-muted-foreground hover:text-foreground'}"
			onclick={() => navigate({ status: null })}
		>
			Усі {data.counts.ALL}
		</button>
		{#each ORDER_STATUSES as key (key)}
			<button
				type="button"
				class="rounded-full px-3 py-1.5 text-xs font-medium transition-colors {data.status === key
					? 'bg-foreground text-background'
					: 'bg-muted/60 text-muted-foreground hover:text-foreground'}"
				onclick={() => navigate({ status: key })}
			>
				{STATUS_LABELS[key]}
				{data.counts[key]}
			</button>
		{/each}
	</div>

	{#if data.orders.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-muted/50 px-6 py-16 text-center">
			<Package size={28} class="text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				{#if data.query}
					За запитом «{data.query}» нічого не знайшлось.
				{:else if data.status}
					У цьому статусі замовлень немає.
				{:else}
					Замовлень ще немає — вони приходять із сайту.
				{/if}
			</p>
		</div>
	{:else}
		<div class="overflow-hidden rounded-[20px] bg-muted/50">
			{#each data.orders as order, index (order.id)}
				<div class="relative">
					{#if index > 0}
						<span class="pointer-events-none absolute top-0 right-3 left-3 h-px bg-foreground/10"
						></span>
					{/if}

					<button
						type="button"
						class="flex w-full items-center gap-3 px-3 py-3 text-left outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50"
						onclick={() => openOrderCard(order)}
					>
						<span class="size-2 shrink-0 rounded-full {STATUS_DOTS[order.status as OrderStatusKey]}"
						></span>

						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">
								{order.customerName}
								<span class="font-mono text-xs font-normal text-muted-foreground">
									{order.number}
								</span>
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{STATUS_LABELS[order.status as OrderStatusKey]} · {when(order.createdAt, false)} ·
								{itemsLabel(order.items.length)}
							</p>
						</div>

						<div class="shrink-0 text-right">
							<p class="text-sm font-medium tabular-nums">{formatUah(order.total)}</p>
							{#if order.paymentStatus === 'PAID'}
								<p class="text-xs text-emerald-600 dark:text-emerald-500">Оплачено</p>
							{/if}
						</div>

						<ChevronRight size={16} class="shrink-0 text-muted-foreground/40" />
					</button>
				</div>
			{/each}
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

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="max-h-[85dvh] gap-5 overflow-y-auto rounded-[28px] border-0 p-5 shadow-2xl ring-0 sm:max-w-md"
	>
		{#if openOrder}
			{@const order = openOrder}
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
			</div>

			<Dialog.Header class="gap-1">
				<Dialog.Title class="font-mono text-xl tracking-tight">{order.number}</Dialog.Title>
				<Dialog.Description>{when(order.createdAt)}</Dialog.Description>
			</Dialog.Header>

			<!-- Статус і оплата застосовуються одразу: кнопка «Зберегти» тут була б
			     зайвим кроком між рішенням і дією. -->
			<form method="POST" action="?/status" use:enhance={applyChange}>
				<input type="hidden" name="id" value={order.id} />
				<div class="overflow-hidden rounded-[18px] bg-muted/60">
					{#each ORDER_STATUSES as key, index (key)}
						{#if index > 0}
							<div class="mx-4 h-px bg-foreground/10"></div>
						{/if}
						<button
							type="submit"
							name="status"
							value={key}
							class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
						>
							<span class="flex items-center gap-2.5 text-sm">
								<span class="size-2 rounded-full {STATUS_DOTS[key]}"></span>
								{STATUS_LABELS[key]}
							</span>
							{#if order.status === key}
								<Check size={16} strokeWidth={2.5} class="shrink-0 text-ring" />
							{/if}
						</button>
					{/each}
				</div>
			</form>

			<form method="POST" action="?/payment" use:enhance={applyChange}>
				<input type="hidden" name="id" value={order.id} />
				<div class="overflow-hidden rounded-[18px] bg-muted/60">
					{#each PAYMENT_STATUSES as key, index (key)}
						{#if index > 0}
							<div class="mx-4 h-px bg-foreground/10"></div>
						{/if}
						<button
							type="submit"
							name="paymentStatus"
							value={key}
							class="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.04]"
						>
							<span class="text-sm">{PAYMENT_LABELS[key]}</span>
							{#if order.paymentStatus === key}
								<Check size={16} strokeWidth={2.5} class="shrink-0 text-ring" />
							{/if}
						</button>
					{/each}
				</div>
			</form>

			<div class="overflow-hidden rounded-[18px] bg-muted/60">
				<div class="flex items-baseline justify-between gap-4 px-4 py-3">
					<span class="shrink-0 text-sm text-muted-foreground">Покупець</span>
					<span class="truncate text-sm">{order.customerName}</span>
				</div>
				<div class="mx-4 h-px bg-foreground/10"></div>
				<div class="flex items-baseline justify-between gap-4 px-4 py-3">
					<span class="shrink-0 text-sm text-muted-foreground">Телефон</span>
					<a href="tel:{order.customerPhone}" class="truncate text-sm text-ring hover:underline">
						{order.customerPhone}
					</a>
				</div>
				{#if order.customerEmail}
					<div class="mx-4 h-px bg-foreground/10"></div>
					<div class="flex items-baseline justify-between gap-4 px-4 py-3">
						<span class="shrink-0 text-sm text-muted-foreground">Пошта</span>
						<a
							href="mailto:{order.customerEmail}"
							class="truncate text-sm text-ring hover:underline"
						>
							{order.customerEmail}
						</a>
					</div>
				{/if}
			</div>

			<div class="overflow-hidden rounded-[18px] bg-muted/60">
				<div class="flex items-baseline justify-between gap-4 px-4 py-3">
					<span class="shrink-0 text-sm text-muted-foreground">Доставка</span>
					<span class="truncate text-sm">
						{DELIVERY_LABELS[order.deliveryMethod as DeliveryMethodKey]}
					</span>
				</div>
				{#if order.deliveryCity}
					<div class="mx-4 h-px bg-foreground/10"></div>
					<div class="flex items-baseline justify-between gap-4 px-4 py-3">
						<span class="shrink-0 text-sm text-muted-foreground">Місто</span>
						<span class="truncate text-sm">{order.deliveryCity}</span>
					</div>
				{/if}
				{#if order.deliveryAddress}
					<div class="mx-4 h-px bg-foreground/10"></div>
					<div class="flex items-baseline justify-between gap-4 px-4 py-3">
						<span class="shrink-0 text-sm text-muted-foreground">Адреса</span>
						<span class="text-right text-sm">{order.deliveryAddress}</span>
					</div>
				{/if}
				{#if order.comment}
					<div class="mx-4 h-px bg-foreground/10"></div>
					<div class="space-y-1 px-4 py-3">
						<span class="text-sm text-muted-foreground">Коментар</span>
						<p class="text-sm">{order.comment}</p>
					</div>
				{/if}
			</div>

			<!-- Позиції — знімок на момент замовлення: назва й ціна не змінюються,
			     навіть якщо товар потім перейменували чи видалили. -->
			<div class="overflow-hidden rounded-[18px] bg-muted/60">
				{#each order.items as item, index (item.id)}
					{#if index > 0}
						<div class="mx-4 h-px bg-foreground/10"></div>
					{/if}
					<div class="flex items-center gap-3 px-3 py-2.5">
						{#if item.imageUrl}
							<img
								src={cloudinaryThumb(item.imageUrl, 80)}
								alt=""
								class="size-10 shrink-0 rounded-[10px] object-cover"
							/>
						{:else}
							<div
								class="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-foreground/[0.06] text-muted-foreground/60"
							>
								<ImageOff size={15} />
							</div>
						{/if}

						<div class="min-w-0 flex-1">
							<p class="truncate text-sm">{item.productName}</p>
							<p class="truncate text-xs text-muted-foreground">
								{item.size} · {item.color} · {item.quantity} × {formatUah(item.unitPrice)}
							</p>
						</div>

						<span class="shrink-0 text-sm tabular-nums">
							{formatUah(item.unitPrice * item.quantity)}
						</span>
					</div>
				{/each}
			</div>

			<div class="overflow-hidden rounded-[18px] bg-muted/60">
				<div class="flex items-baseline justify-between gap-4 px-4 py-2.5">
					<span class="text-sm text-muted-foreground">Товари</span>
					<span class="text-sm tabular-nums">{formatUah(order.subtotal)}</span>
				</div>
				<div class="mx-4 h-px bg-foreground/10"></div>
				<div class="flex items-baseline justify-between gap-4 px-4 py-2.5">
					<span class="text-sm text-muted-foreground">Доставка</span>
					<span class="text-sm tabular-nums">
						{order.deliveryCost === 0 ? 'За тарифом' : formatUah(order.deliveryCost)}
					</span>
				</div>
				<div class="mx-4 h-px bg-foreground/10"></div>
				<div class="flex items-baseline justify-between gap-4 px-4 py-3">
					<span class="text-sm font-medium">Разом</span>
					<span class="text-base font-semibold tabular-nums">{formatUah(order.total)}</span>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
