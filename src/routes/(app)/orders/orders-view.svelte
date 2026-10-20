<script lang="ts">
	import { untrack, type Component } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { navigating, page as pageState } from '$app/state';
	import { Check, ChevronDown, Package, Gift, Layers } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import ExpandSearch from '$lib/components/expand-search.svelte';
	import { formatUah } from '$lib/money';
	import { bodyRow, cell, headRow, menu, menuItem, pill, pillActive, table } from '$lib/table';
	import {
		ORDER_STATUSES,
		STATUS_LABELS,
		PAYMENT_LABELS,
		type OrderStatusKey,
		type PaymentStatusKey,
		type DeliveryMethodKey
	} from '$lib/orders';
	import { STATUS_ICONS } from './order-icons';
	import OrderCard from './order-card.svelte';
	import StatusBadge from './status-badge.svelte';
	import CarrierIcon from './carrier-icon.svelte';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

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

	// Перехід із пошуку (Ctrl K): ?open=<id> одразу відкриває картку. Закрита
	// вручну картка не відкривається знову — openId лишається тим самим.
	$effect(() => {
		const target = pageState.url.searchParams.get('open');
		if (!target || target === openId) return;
		const order = data.orders.find((item) => item.id === target);
		if (order) untrack(() => openOrderCard(order));
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

	/** Колонки таблиці: однакові для шапки й рядків. Перша — порядковий номер. */
	const columns =
		'grid-cols-[40px_minmax(200px,1.6fr)_160px_110px_minmax(180px,1.4fr)_70px_120px_110px]';
	const HEADERS = ['Покупець', 'Статус', 'Оплата', 'Доставка', 'Позицій', 'Дата', 'Сума'];

	/** Пункти меню «Статус»: свій контурний значок у кожного, як у ClickUp. */
	const STATUS_MENU: { value: 'ALL' | OrderStatusKey; label: string; icon: Component }[] = [
		{ value: 'ALL', label: 'Усі', icon: Layers },
		...ORDER_STATUSES.map((key) => ({
			value: key,
			label: STATUS_LABELS[key],
			icon: STATUS_ICONS[key]
		}))
	];

	/** Доставка коротко — у вузькій колонці повна назва не влазить. */
	const DELIVERY_SHORT: Record<DeliveryMethodKey, string> = {
		NOVA_POSHTA_BRANCH: 'НП, відділення',
		NOVA_POSHTA_COURIER: 'НП, курʼєр',
		UKRPOSHTA_BRANCH: 'Укрпошта',
		PICKUP: 'Самовивіз'
	};
</script>

<svelte:head><title>Замовлення — CRM LILY LOOK</title></svelte:head>

<!-- Список у стилі ClickUp: заголовок, рядок кнопок-пілюль, таблиця на всю
     ширину з колонками. Клік по рядку відкриває картку замовлення. -->
<div class="flex flex-col gap-2 pb-6">
	<div class="flex h-8 items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Замовлення</h1>
		<span class="text-[17px] font-semibold tracking-tight text-muted-foreground/50">
			{data.total}
		</span>
		{#if loading}
			<Spinner class="size-3.5 text-muted-foreground" />
		{/if}
	</div>

	<div class="flex flex-wrap items-center gap-1.5">
		<!-- Статус: усі стани з лічильниками в одному меню -->
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<button {...props} type="button" class={data.status ? pillActive : pill}>
						<Layers size={13} />
						Статус: {data.status ? STATUS_LABELS[data.status as OrderStatusKey] : 'Усі'}
						<ChevronDown size={12} class="opacity-60" />
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<!-- Меню як у ClickUp: велике скруглення, сірі контурні іконки, рядки
			     по 30 px. Вибраний статус — галочка праворуч. -->
			<DropdownMenu.Content align="start" class={menu}>
				{#each STATUS_MENU as item (item.value)}
					{@const selected = (data.status ?? 'ALL') === item.value}
					<DropdownMenu.Item
						class={menuItem}
						onSelect={() => navigate({ status: item.value === 'ALL' ? null : item.value })}
					>
						<item.icon size={15} class="shrink-0 text-muted-foreground" />
						{item.label}
						<span class="ml-auto text-xs text-muted-foreground tabular-nums">
							{data.counts[item.value]}
						</span>
						<Check
							size={13}
							strokeWidth={2.5}
							class="shrink-0 {selected ? 'text-foreground' : 'invisible'}"
						/>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<button
			type="button"
			aria-pressed={data.prizeOnly}
			class={data.prizeOnly ? pillActive : pill}
			onclick={() => navigate({ prize: data.prizeOnly ? null : '1' })}
		>
			<Gift size={13} />
			З призом колеса
			<span class="tabular-nums opacity-60">{data.prizeCount}</span>
		</button>

		<div class="ml-auto">
			<ExpandSearch
				bind:value={search}
				applied={data.query}
				label="Пошук замовлення"
				placeholder="Номер, імʼя або телефон"
				onsearch={(query) => navigate({ q: query || null })}
			/>
		</div>
	</div>

	{#if data.orders.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-block px-6 py-16 text-center">
			<Package size={28} class="text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				{#if data.query}
					За запитом «{data.query}» нічого не знайшлось.
				{:else if data.prizeOnly}
					Замовлень з призом колеса ще немає.
				{:else if data.status}
					У цьому статусі замовлень немає.
				{:else}
					Замовлень ще немає — вони приходять із сайту.
				{/if}
			</p>
		</div>
	{:else}
		<!-- Таблиця виходить за відступи сторінки й притискається до країв
		     панелі; заголовок і кнопки над нею лишаються з відступами. На вузькому екрані
		     гортається вбік — колонки не стискаються. -->
		<div class="-mr-2 -ml-3 overflow-x-auto">
			<div class="min-w-247.5 {table}" role="table" aria-label="Замовлення">
				<div class="{headRow} {columns}" role="row">
					<div class="{cell} justify-center" role="columnheader">#</div>
					{#each HEADERS as header (header)}
						<div class={cell} role="columnheader">
							{header}
						</div>
					{/each}
				</div>

				{#each data.orders as order, index (order.id)}
					{@const status = order.status as OrderStatusKey}
					<button
						type="button"
						class="{bodyRow} {columns}"
						role="row"
						onclick={() => openOrderCard(order)}
					>
						<!-- Порядковий номер — наскрізний між сторінками: на другій з 21-го. -->
						<span
							class="{cell} justify-center text-[13px] text-muted-foreground tabular-nums"
							role="cell"
						>
							{(data.page - 1) * data.perPage + index + 1}
						</span>
						<span class="{cell} gap-2.5" role="cell">
							<span class="truncate font-medium">{order.customerName}</span>
							{#if order.prize}
								<Gift size={14} class="shrink-0 text-violet" aria-label="З призом колеса" />
							{/if}
						</span>
						<span class={cell} role="cell">
							<StatusBadge {status} />
						</span>
						<span
							class="{cell} text-[13px] {order.paymentStatus === 'PAID'
								? 'text-emerald-600 dark:text-emerald-500'
								: 'text-muted-foreground'}"
							role="cell"
						>
							<span class="truncate">
								{PAYMENT_LABELS[order.paymentStatus as PaymentStatusKey]}
							</span>
						</span>
						<span class="{cell} gap-2 text-[13px]" role="cell">
							<CarrierIcon method={order.deliveryMethod as DeliveryMethodKey} size={15} />
							<span class="truncate">
								{DELIVERY_SHORT[order.deliveryMethod as DeliveryMethodKey]}
								{#if order.deliveryCity}
									<span class="text-muted-foreground">· {order.deliveryCity}</span>
								{/if}
							</span>
						</span>
						<span class="{cell} text-[13px] text-muted-foreground tabular-nums" role="cell">
							{order.items.length}
						</span>
						<span class="{cell} text-[13px] text-muted-foreground" role="cell">
							<span class="truncate">{when(order.createdAt, false)}</span>
						</span>
						<span class="{cell} font-medium tabular-nums" role="cell">
							{formatUah(order.total)}
						</span>
					</button>
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

<OrderCard bind:open order={openOrder} />
