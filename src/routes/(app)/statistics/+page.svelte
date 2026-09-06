<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import { ArrowDownRight, ArrowUpRight, ChevronRight, TrendingUp } from '@lucide/svelte';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { formatUah } from '$lib/money';
	import { PERIODS, PERIOD_LABELS, type PeriodKey } from '$lib/statistics';
	import { ORDER_STATUSES, STATUS_DOTS, STATUS_LABELS } from '$lib/orders';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const loading = $derived(navigating.to?.url.pathname === '/statistics');

	// Масштаб графіка — за найкращим днем періоду. Нуль лишає стовпчики
	// «на нулі», а не ділить на нуль.
	const peak = $derived(Math.max(0, ...data.series.map((point) => point.revenue)));
	const statusTotal = $derived(Object.values(data.statuses).reduce((sum, count) => sum + count, 0));

	// Підписи осі: перший, середній і останній — решта тільки заважає.
	const ticks = $derived([0, Math.floor((data.series.length - 1) / 2), data.series.length - 1]);

	function selectPeriod(period: PeriodKey) {
		goto(`/statistics?period=${period}`, { keepFocus: true, noScroll: true });
	}

	/** «2026-09-06» → «6 вер». Ключ — київська дата, тому читаємо його як UTC. */
	function dayLabel(key: string): string {
		const [year, month, day] = key.split('-').map(Number);
		return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('uk-UA', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
	}

	function pointLabel(point: (typeof data.series)[number]): string {
		const range =
			point.key === point.endKey
				? dayLabel(point.key)
				: `${dayLabel(point.key)} — ${dayLabel(point.endKey)}`;
		return `${range}: ${formatUah(point.revenue)}`;
	}

	/** «1 товар», «2 товари», «5 товарів». */
	function unitsLabel(count: number): string {
		const mod10 = count % 10;
		const mod100 = count % 100;
		if (mod10 === 1 && mod100 !== 11) return `${count} товар`;
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} товари`;
		return `${count} товарів`;
	}
</script>

<svelte:head><title>Статистика — CRM LILY LOOK</title></svelte:head>

{#snippet trend(value: number | null)}
	{#if value === null}
		<span class="text-xs text-muted-foreground/60">нове</span>
	{:else if value === 0}
		<span class="text-xs text-muted-foreground/60">без змін</span>
	{:else if value > 0}
		<span class="inline-flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-500">
			<ArrowUpRight size={13} strokeWidth={2.5} />{value}%
		</span>
	{:else}
		<span class="inline-flex items-center gap-0.5 text-xs text-red-600 dark:text-red-500">
			<ArrowDownRight size={13} strokeWidth={2.5} />{Math.abs(value)}%
		</span>
	{/if}
{/snippet}

{#snippet topRow(item: (typeof data.top)[number], index: number)}
	<span class="w-4 shrink-0 text-sm text-muted-foreground/60 tabular-nums">{index + 1}</span>
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-medium">{item.name}</p>
		<p class="text-xs text-muted-foreground">{unitsLabel(item.units)}</p>
	</div>
	<span class="shrink-0 text-sm font-medium tabular-nums">{formatUah(item.revenue)}</span>
{/snippet}

{#snippet tile(label: string, value: string, change: number | null)}
	<div class="space-y-1 bg-card px-4 py-4">
		<p class="text-xs text-muted-foreground">{label}</p>
		<p class="text-xl font-semibold tracking-tight tabular-nums">{value}</p>
		{@render trend(change)}
	</div>
{/snippet}

<div class="mx-auto max-w-3xl space-y-6 pb-12">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<h1 class="text-2xl font-semibold tracking-tight">Статистика</h1>
			{#if loading}
				<Spinner class="size-4 text-muted-foreground" />
			{/if}
		</div>

		<!-- Сегментований перемикач: усі періоди видно одразу, без випадайки. -->
		<div class="inline-flex rounded-full bg-muted/60 p-0.5">
			{#each PERIODS as key (key)}
				<button
					type="button"
					aria-pressed={data.period === key}
					class="rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors {data.period ===
					key
						? 'bg-card text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => selectPeriod(key)}
				>
					{PERIOD_LABELS[key]}
				</button>
			{/each}
		</div>
	</div>

	<div
		class="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-foreground/10 sm:grid-cols-4"
	>
		{@render tile('Виручка', formatUah(data.metrics.revenue.value), data.metrics.revenue.delta)}
		{@render tile('Замовлення', String(data.metrics.orders.value), data.metrics.orders.delta)}
		{@render tile(
			'Середній чек',
			formatUah(data.metrics.average.value),
			data.metrics.average.delta
		)}
		{@render tile('Продано', String(data.metrics.units.value), data.metrics.units.delta)}
	</div>

	<p class="text-xs text-muted-foreground">
		Зміна — до попереднього такого ж періоду. Скасовані замовлення у виручку не входять.
	</p>

	<!-- Графік виручки -->
	<div class="space-y-4 rounded-[20px] bg-muted/50 p-5">
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="text-sm font-medium">Виручка по {data.bucket === 7 ? 'тижнях' : 'днях'}</h2>
			<span class="text-xs text-muted-foreground tabular-nums">
				пік {formatUah(peak)}
			</span>
		</div>

		{#if peak === 0}
			<div class="flex flex-col items-center gap-3 py-10 text-center">
				<TrendingUp size={26} class="text-muted-foreground/40" />
				<p class="text-sm text-muted-foreground">За цей період продажів не було.</p>
			</div>
		{:else}
			<div class="flex h-40 items-end gap-px">
				{#each data.series as point (point.key)}
					<div
						class="min-h-[2px] flex-1 rounded-t-[3px] bg-ring/80 transition-colors hover:bg-ring"
						style="height: {Math.max(1.5, (point.revenue / peak) * 100)}%"
						title={pointLabel(point)}
					></div>
				{/each}
			</div>

			<div class="flex justify-between text-[11px] text-muted-foreground">
				{#each ticks as index (index)}
					<span>{dayLabel(data.series[index]?.key ?? data.startKey)}</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Статуси -->
	<div class="space-y-4 rounded-[20px] bg-muted/50 p-5">
		<h2 class="text-sm font-medium">Статуси замовлень</h2>

		{#if statusTotal === 0}
			<p class="text-sm text-muted-foreground">За цей період замовлень не було.</p>
		{:else}
			<!-- Одна смуга замість чотирьох діаграм: співвідношення видно миттєво. -->
			<div class="flex h-2 overflow-hidden rounded-full">
				{#each ORDER_STATUSES as key (key)}
					{#if (data.statuses[key] ?? 0) > 0}
						<span
							class={STATUS_DOTS[key]}
							style="width: {((data.statuses[key] ?? 0) / statusTotal) * 100}%"
							title="{STATUS_LABELS[key]}: {data.statuses[key]}"
						></span>
					{/if}
				{/each}
			</div>

			<div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
				{#each ORDER_STATUSES as key (key)}
					{@const count = data.statuses[key] ?? 0}
					<div class="flex items-center gap-2.5">
						<span class="size-2 shrink-0 rounded-full {STATUS_DOTS[key]}"></span>
						<span class="flex-1 text-sm {count === 0 ? 'text-muted-foreground/50' : ''}">
							{STATUS_LABELS[key]}
						</span>
						<span class="text-sm tabular-nums {count === 0 ? 'text-muted-foreground/50' : ''}">
							{count}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Топ товарів -->
	<div class="space-y-3">
		<h2 class="px-1 text-sm font-medium">Топ товарів</h2>

		{#if data.top.length === 0}
			<div class="rounded-[20px] bg-muted/50 px-5 py-8 text-center text-sm text-muted-foreground">
				Продажів за цей період немає.
			</div>
		{:else}
			<div class="overflow-hidden rounded-[20px] bg-muted/50">
				{#each data.top as item, index (item.name)}
					{#if index > 0}
						<div class="mx-3 h-px bg-foreground/10"></div>
					{/if}
					{#if item.id}
						<a
							href="/products/{item.id}"
							class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03]"
						>
							{@render topRow(item, index)}
							<ChevronRight size={16} class="shrink-0 text-muted-foreground/40" />
						</a>
					{:else}
						<!-- Товар видалили після продажу — рядок лишається, посилання нема. -->
						<div class="flex items-center gap-3 px-4 py-3">
							{@render topRow(item, index)}
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Залишки: єдине місце, де це видно без обходу картки кожного товару. -->
	{#if data.lowStock.length > 0}
		<div class="space-y-3">
			<h2 class="px-1 text-sm font-medium">Закінчується</h2>

			<div class="overflow-hidden rounded-[20px] bg-muted/50">
				{#each data.lowStock as variant, index (variant.id)}
					{#if index > 0}
						<div class="mx-3 h-px bg-foreground/10"></div>
					{/if}
					<a
						href="/products/{variant.product.id}"
						class="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03]"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{variant.product.name}</p>
							<p class="truncate text-xs text-muted-foreground">
								{variant.size} · {variant.color}
							</p>
						</div>
						<span
							class="shrink-0 text-sm tabular-nums {variant.stock === 0
								? 'text-red-600 dark:text-red-500'
								: 'text-amber-600 dark:text-amber-500'}"
						>
							{variant.stock === 0 ? 'немає' : `${variant.stock} шт`}
						</span>
						<ChevronRight size={16} class="shrink-0 text-muted-foreground/40" />
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>
