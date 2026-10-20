<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating } from '$app/state';
	import {
		ArrowDownRight,
		ArrowUpRight,
		Banknote,
		ChevronRight,
		Package,
		PackageOpen,
		Receipt,
		Shirt,
		TrendingUp
	} from '@lucide/svelte';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { formatUah } from '$lib/money';
	import { PERIODS, PERIOD_LABELS, type PeriodKey } from '$lib/statistics';
	import { ORDER_STATUSES, STATUS_DOTS, STATUS_LABELS } from '$lib/orders';
	import LineChart from '$lib/components/line-chart.svelte';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

	type Point = (typeof data.series)[number];
	type MetricId = 'revenue' | 'orders' | 'average' | 'units';

	const loading = $derived(navigating.to?.url.pathname === '/statistics');

	/** Яку метрику малює графік — клік по плитці над ним. */
	let metric = $state<MetricId>('revenue');

	/** «12 тис», «1,2 млн» — коротко для осі. Гроші — у копійках. */
	function compactUah(kop: number): string {
		const uah = kop / 100;
		const short = (value: number) =>
			value.toLocaleString('uk-UA', { maximumFractionDigits: value < 10 ? 1 : 0 });
		if (uah >= 1_000_000) return `${short(uah / 1_000_000)} млн`;
		if (uah >= 1000) return `${short(uah / 1000)} тис`;
		return String(Math.round(uah));
	}

	/** Кількості — лише цілі підписи: «1,5 замовлення» на осі не буває. */
	const countAxis = (value: number) => (Number.isInteger(value) ? String(value) : '');

	const METRICS = $derived([
		{
			id: 'revenue' as const,
			label: 'Виручка',
			icon: Banknote,
			total: formatUah(data.metrics.revenue.value),
			delta: data.metrics.revenue.delta,
			pick: (point: Point) => point.revenue,
			format: formatUah,
			axis: compactUah
		},
		{
			id: 'orders' as const,
			label: 'Замовлення',
			icon: Package,
			total: String(data.metrics.orders.value),
			delta: data.metrics.orders.delta,
			pick: (point: Point) => point.orders,
			format: (value: number) => `${value} замовл.`,
			axis: countAxis
		},
		{
			id: 'average' as const,
			label: 'Середній чек',
			icon: Receipt,
			total: formatUah(data.metrics.average.value),
			delta: data.metrics.average.delta,
			pick: (point: Point) => (point.orders ? Math.round(point.revenue / point.orders) : 0),
			format: formatUah,
			axis: compactUah
		},
		{
			id: 'units' as const,
			label: 'Продано',
			icon: Shirt,
			total: `${data.metrics.units.value} шт`,
			delta: data.metrics.units.delta,
			pick: (point: Point) => point.units,
			format: (value: number) => `${value} шт`,
			axis: countAxis
		}
	]);

	const current = $derived(METRICS.find((item) => item.id === metric) ?? METRICS[0]);

	const chartPoints = $derived(
		data.series.map((point) => ({
			label: dayLabel(point.key),
			title:
				point.key === point.endKey
					? dayLabel(point.key)
					: `${dayLabel(point.key)} — ${dayLabel(point.endKey)}`,
			value: current.pick(point),
			detail:
				metric === 'revenue'
					? `${point.orders} замовл.`
					: metric === 'orders'
						? formatUah(point.revenue)
						: undefined
		}))
	);
	const empty = $derived(chartPoints.every((point) => point.value === 0));

	const statusTotal = $derived(Object.values(data.statuses).reduce((sum, count) => sum + count, 0));
	const topRevenue = $derived(Math.max(1, ...data.top.map((item) => item.revenue)));

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

	/** «1 товар», «2 товари», «5 товарів». */
	function unitsLabel(count: number): string {
		const mod10 = count % 10;
		const mod100 = count % 100;
		if (mod10 === 1 && mod100 !== 11) return `${count} товар`;
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} товари`;
		return `${count} товарів`;
	}

	const percent = (part: number, whole: number) =>
		whole === 0 ? 0 : Math.round((part / whole) * 100);

	/** Картка в стилі ClickUp: тонка рамка, шапка з назвою через лінію. */
	const card = 'overflow-hidden rounded-[12px] border border-border bg-card';
	const cardHead = 'flex h-11 items-center gap-2 border-b border-border px-4';
	const cardTitle = 'text-[13px] font-semibold tracking-tight';
</script>

<svelte:head><title>Статистика — CRM LILY LOOK</title></svelte:head>

{#snippet trend(value: number | null)}
	{#if value === null}
		<span
			class="inline-flex h-5 items-center rounded-[6px] bg-foreground/6 px-1.5 text-[11px] font-medium text-muted-foreground"
		>
			нове
		</span>
	{:else if value === 0}
		<span
			class="inline-flex h-5 items-center rounded-[6px] bg-foreground/6 px-1.5 text-[11px] font-medium text-muted-foreground"
		>
			0%
		</span>
	{:else if value > 0}
		<span
			class="inline-flex h-5 items-center gap-0.5 rounded-[6px] bg-emerald-500/12 px-1.5 text-[11px] font-semibold text-emerald-600 tabular-nums dark:text-emerald-400"
		>
			<ArrowUpRight size={12} strokeWidth={2.5} />{value}%
		</span>
	{:else}
		<span
			class="inline-flex h-5 items-center gap-0.5 rounded-[6px] bg-red-500/12 px-1.5 text-[11px] font-semibold text-red-600 tabular-nums dark:text-red-400"
		>
			<ArrowDownRight size={12} strokeWidth={2.5} />{Math.abs(value)}%
		</span>
	{/if}
{/snippet}

<div class="flex flex-col gap-3 pb-6">
	<div class="flex h-8 flex-wrap items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Статистика</h1>
		{#if loading}
			<Spinner class="size-3.5 text-muted-foreground" />
		{/if}

		<!-- Періоди: сегментований перемикач, вибраний — біла плитка. -->
		<div class="ml-auto flex h-7 rounded-[8px] bg-foreground/6 p-0.5">
			{#each PERIODS as key (key)}
				<button
					type="button"
					aria-pressed={data.period === key}
					class="rounded-[6px] px-2.5 text-[12px] font-medium transition-colors {data.period === key
						? 'bg-card text-foreground shadow-sm ring-1 ring-border'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => selectPeriod(key)}
				>
					{PERIOD_LABELS[key]}
				</button>
			{/each}
		</div>
	</div>

	<!-- Головний блок: чотири показники — вони ж вкладки графіка. -->
	<section class={card}>
		<div class="grid grid-cols-2 border-b border-border lg:grid-cols-4" role="tablist">
			{#each METRICS as item, index (item.id)}
				{@const selected = metric === item.id}
				<button
					type="button"
					role="tab"
					aria-selected={selected}
					class="relative flex flex-col gap-1.5 px-4 py-3.5 text-left transition-colors {index > 0
						? 'border-l border-border'
						: ''} {index === 2 ? 'max-lg:border-l-0' : ''} {index < 2
						? 'max-lg:border-b max-lg:border-border'
						: ''} {selected ? '' : 'hover:bg-foreground/3'}"
					onclick={() => (metric = item.id)}
				>
					<span class="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
						<item.icon size={13} />
						{item.label}
					</span>
					<span class="flex flex-wrap items-center gap-2">
						<span class="text-[22px] leading-7 font-semibold tracking-tight tabular-nums">
							{item.total}
						</span>
						{@render trend(item.delta)}
					</span>
					{#if selected}
						<span class="absolute inset-x-0 -bottom-px h-0.5 bg-primary"></span>
					{/if}
				</button>
			{/each}
		</div>

		<div class="px-4 pt-3 pb-2">
			<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<h2 class={cardTitle}>
					{current.label} по {data.bucket === 7 ? 'тижнях' : 'днях'}
				</h2>
				<p class="text-[12px] text-muted-foreground">
					Зміна — до попередніх {data.days} днів. Скасовані замовлення не враховано.
				</p>
			</div>

			{#if empty}
				<div class="flex h-65 flex-col items-center justify-center gap-2 text-center">
					<TrendingUp size={24} class="text-muted-foreground/40" />
					<p class="text-[13px] text-muted-foreground">За цей період продажів не було.</p>
				</div>
			{:else}
				<LineChart points={chartPoints} format={current.format} formatAxis={current.axis} />
			{/if}
		</div>
	</section>

	<div class="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
		<!-- Топ товарів: смужка — частка від найкращого. -->
		<section class={card}>
			<header class={cardHead}>
				<h2 class={cardTitle}>Топ товарів</h2>
				<span class="ml-auto text-[12px] text-muted-foreground">за виручкою</span>
			</header>

			{#if data.top.length === 0}
				<p class="px-4 py-10 text-center text-[13px] text-muted-foreground">
					Продажів за цей період немає.
				</p>
			{:else}
				<div class="divide-y divide-border">
					{#each data.top as item, index (item.name)}
						{@const share = (item.revenue / topRevenue) * 100}
						<svelte:element
							this={item.id ? 'a' : 'div'}
							href={item.id ? `/products/${item.id}` : undefined}
							class="group flex items-center gap-3 px-4 py-2.5 {item.id
								? 'transition-colors hover:bg-foreground/3'
								: ''}"
						>
							<span class="w-4 shrink-0 text-[12px] text-muted-foreground tabular-nums">
								{index + 1}
							</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<p class="min-w-0 flex-1 truncate text-[13px] font-medium">{item.name}</p>
									<span class="shrink-0 text-[13px] font-semibold tabular-nums">
										{formatUah(item.revenue)}
									</span>
								</div>
								<div class="mt-1.5 flex items-center gap-2">
									<span class="h-1 flex-1 overflow-hidden rounded-full bg-foreground/6">
										<span class="block h-full rounded-full bg-primary" style:width="{share}%"
										></span>
									</span>
									<span class="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
										{unitsLabel(item.units)}
									</span>
								</div>
							</div>
							{#if item.id}
								<ChevronRight
									size={15}
									class="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground"
								/>
							{/if}
						</svelte:element>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Статуси: одна смуга співвідношення й список із часткою. -->
		<section class={card}>
			<header class={cardHead}>
				<h2 class={cardTitle}>Статуси замовлень</h2>
				<span class="ml-auto text-[12px] text-muted-foreground tabular-nums">
					усього {statusTotal}
				</span>
			</header>

			{#if statusTotal === 0}
				<p class="px-4 py-10 text-center text-[13px] text-muted-foreground">
					За цей період замовлень не було.
				</p>
			{:else}
				<div class="space-y-3 p-4">
					<div class="flex h-2 gap-0.5 overflow-hidden rounded-full">
						{#each ORDER_STATUSES as key (key)}
							{#if (data.statuses[key] ?? 0) > 0}
								<span
									class="h-full first:rounded-l-full last:rounded-r-full {STATUS_DOTS[key]}"
									style:width="{((data.statuses[key] ?? 0) / statusTotal) * 100}%"
									title="{STATUS_LABELS[key]}: {data.statuses[key]}"
								></span>
							{/if}
						{/each}
					</div>

					<div class="space-y-0.5">
						{#each ORDER_STATUSES as key (key)}
							{@const count = data.statuses[key] ?? 0}
							<div
								class="flex h-8 items-center gap-2.5 rounded-[6px] px-1 text-[13px] {count === 0
									? 'text-muted-foreground/50'
									: ''}"
							>
								<span class="size-2 shrink-0 rounded-full {STATUS_DOTS[key]}"></span>
								<span class="flex-1">{STATUS_LABELS[key]}</span>
								<span class="w-10 text-right text-[12px] text-muted-foreground tabular-nums">
									{percent(count, statusTotal)}%
								</span>
								<span class="w-8 text-right font-medium tabular-nums">{count}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>
	</div>

	<!-- Залишки: єдине місце, де це видно без обходу картки кожного товару. -->
	{#if data.lowStock.length > 0}
		<section class={card}>
			<header class={cardHead}>
				<PackageOpen size={14} class="text-amber-500" />
				<h2 class={cardTitle}>Закінчується</h2>
				<span class="ml-auto text-[12px] text-muted-foreground">
					{data.lowStock.length} варіант{data.lowStock.length === 1 ? '' : 'и'}
				</span>
			</header>
			<div class="-mb-px grid divide-border md:grid-cols-2 md:divide-x">
				{#each data.lowStock as variant (variant.id)}
					<a
						href="/products/{variant.product.id}"
						class="group flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors hover:bg-foreground/3"
					>
						<div class="min-w-0 flex-1">
							<p class="truncate text-[13px] font-medium">{variant.product.name}</p>
							<p class="truncate text-[12px] text-muted-foreground">
								{variant.size} · {variant.color}
							</p>
						</div>
						<span
							class="inline-flex h-5.5 shrink-0 items-center rounded-[6px] px-2 text-[11px] font-semibold tracking-wide uppercase {variant.stock ===
							0
								? 'bg-red-500 text-white'
								: 'bg-amber-500 text-white'}"
						>
							{variant.stock === 0 ? 'немає' : `${variant.stock} шт`}
						</span>
						<ChevronRight
							size={15}
							class="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground"
						/>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
