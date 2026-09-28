<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { Check, ChevronRight, ImageOff, Eye } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import {
		FUNNEL_STEPS,
		RANGES,
		RANGE_LABELS,
		SOURCES,
		SOURCE_LABELS,
		type RangeKey,
		type SourceKey
	} from '$lib/traffic';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const loading = $derived(navigating.to?.url.pathname === '/traffic');
	const ready = $derived(data.state === 'ready' ? data : null);

	// Власний період правимо локально й застосовуємо кнопкою: інакше кожна
	// зміна дати смикала б звіт посеред вибору.
	let customOpen = $state(false);
	let customFrom = $state('');
	let customTo = $state('');

	const showCustom = $derived(customOpen || data.range.key === 'custom');

	const peak = $derived(Math.max(0, ...(ready?.series ?? []).map((point) => point.visitors)));
	const ticks = $derived.by(() => {
		const length = ready?.series.length ?? 0;
		return length === 0 ? [] : [0, Math.floor((length - 1) / 2), length - 1];
	});

	const hasFacebook = $derived(
		data.source === 'facebook' || (ready?.sources.some((row) => row.source === 'facebook') ?? false)
	);

	/** Змінює параметри адреси, решту лишає як є. */
	function navigate(changes: Record<string, string | null>) {
		const params = new SvelteURLSearchParams(page.url.searchParams);
		for (const [key, value] of Object.entries(changes)) {
			if (value === null) params.delete(key);
			else params.set(key, value);
		}
		const query = params.toString();
		goto(query ? `/traffic?${query}` : '/traffic', { keepFocus: true, noScroll: true });
	}

	function pickRange(key: RangeKey) {
		if (key === 'custom') {
			customFrom = data.range.from;
			customTo = data.range.to;
			customOpen = true;
			return;
		}
		customOpen = false;
		navigate({ range: key, from: null, to: null });
	}

	function applyCustom() {
		if (!customFrom || !customTo) return;
		navigate({ range: 'custom', from: customFrom, to: customTo });
	}

	function pickSource(key: SourceKey | null) {
		navigate({ source: key });
	}

	const number = (value: number) => value.toLocaleString('uk-UA');
	const percent = (value: number | null) => (value === null ? '—' : `${value}%`);

	/** «2026-09-06» → «6 вер». Ключ — київська дата, тому читаємо його як UTC. */
	function dayLabel(key: string): string {
		const [year, month, day] = key.split('-').map(Number);
		return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('uk-UA', {
			day: 'numeric',
			month: 'short',
			timeZone: 'UTC'
		});
	}

	function sourceLabel(key: string): string {
		return SOURCE_LABELS[key as SourceKey] ?? key;
	}
</script>

<svelte:head><title>Відвідуваність — CRM LILY LOOK</title></svelte:head>

{#snippet chip(label: string, active: boolean, onclick: () => void)}
	<button
		type="button"
		aria-pressed={active}
		class="flex items-center gap-1 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors {active
			? 'bg-primary text-primary-foreground'
			: 'bg-muted/60 text-muted-foreground hover:text-foreground'}"
		{onclick}
	>
		{#if active}<Check size={13} strokeWidth={2.5} />{/if}
		{label}
	</button>
{/snippet}

{#snippet tile(label: string, value: string, note?: string)}
	<div class="space-y-1 bg-card px-4 py-4">
		<p class="text-xs text-muted-foreground">{label}</p>
		<p class="text-xl font-semibold tracking-tight tabular-nums">{value}</p>
		{#if note}<p class="text-xs text-muted-foreground/70">{note}</p>{/if}
	</div>
{/snippet}

<div class="space-y-6 pb-12">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<h1 class="text-2xl font-semibold tracking-tight">Відвідуваність</h1>
			{#if loading}<Spinner class="size-4 text-muted-foreground" />{/if}
		</div>

		<div class="inline-flex rounded-full bg-muted/60 p-0.5">
			{#each RANGES as key (key)}
				{@const active = key === 'custom' ? showCustom : !showCustom && data.range.key === key}
				<button
					type="button"
					aria-pressed={active}
					class="rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors {active
						? 'bg-surface text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => pickRange(key)}
				>
					{RANGE_LABELS[key]}
				</button>
			{/each}
		</div>
	</div>

	{#if showCustom}
		<form
			class="flex flex-wrap items-center gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				applyCustom();
			}}
		>
			<Input
				type="date"
				bind:value={customFrom}
				max={data.today}
				class="h-9 w-auto rounded-xl"
				aria-label="Від"
			/>
			<span class="text-muted-foreground">—</span>
			<Input
				type="date"
				bind:value={customTo}
				max={data.today}
				class="h-9 w-auto rounded-xl"
				aria-label="До"
			/>
			<Button type="submit" size="sm" class="h-9 rounded-xl px-4">Показати</Button>
		</form>
	{/if}

	<div class="flex flex-wrap gap-1.5">
		{@render chip('Усі джерела', data.source === null, () => pickSource(null))}
		{#each SOURCES as key (key)}
			{@render chip(SOURCE_LABELS[key], data.source === key, () => pickSource(key))}
		{/each}
	</div>

	{#if !ready}
		<div class="flex flex-col items-center gap-3 rounded-[20px] bg-muted/50 px-6 py-16 text-center">
			<Eye size={26} class="text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">Даних поки немає</p>
		</div>
	{:else}
		<div
			class="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-foreground/10 sm:grid-cols-5"
		>
			{@render tile('Відвідувачі', number(ready.totals.visitors))}
			{@render tile('Перегляди', number(ready.totals.views))}
			{@render tile('Додали в кошик', number(ready.totals.added))}
			{@render tile('Замовили', number(ready.totals.ordered), `у CRM: ${ready.crmOrders}`)}
			{@render tile('Конверсія', percent(ready.totals.conversion))}
		</div>

		{#if ready.series.length > 1}
			<div class="space-y-4 rounded-[20px] bg-muted/50 p-5">
				<div class="flex items-baseline justify-between gap-3">
					<h2 class="text-sm font-medium">Відвідувачі по днях</h2>
					<span class="text-xs text-muted-foreground tabular-nums">пік {number(peak)}</span>
				</div>

				<div class="flex h-36 items-end gap-px">
					{#each ready.series as point (point.key)}
						<div
							class="min-h-[2px] flex-1 rounded-t-[3px] bg-ring/80 transition-colors hover:bg-ring"
							style="height: {peak === 0 ? 1.5 : Math.max(1.5, (point.visitors / peak) * 100)}%"
							title="{dayLabel(point.key)}: {point.visitors} відв., {point.views} перегл."
						></div>
					{/each}
				</div>

				<div class="flex justify-between text-[11px] text-muted-foreground">
					{#each ticks as index (index)}
						<span>{dayLabel(ready.series[index].key)}</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Воронка — головний звіт: на якому кроці люди відпадають. -->
		<div class="space-y-4 rounded-[20px] bg-muted/50 p-5">
			<h2 class="text-sm font-medium">Воронка</h2>

			<div class="space-y-3">
				{#each ready.funnel as step (step.key)}
					{@const width =
						ready.totals.visitors === 0 ? 0 : (step.count / ready.totals.visitors) * 100}
					<div class="space-y-1.5">
						<div class="flex items-baseline justify-between gap-3 text-sm">
							<span class={step.worst ? 'font-medium text-destructive' : ''}>{step.label}</span>
							<span class="flex items-baseline gap-2 tabular-nums">
								{#if step.pass !== null}
									<span class="text-xs {step.worst ? 'text-destructive' : 'text-muted-foreground'}">
										{step.pass}%
									</span>
								{/if}
								<span class="font-medium">{number(step.count)}</span>
							</span>
						</div>
						<div class="h-2 overflow-hidden rounded-full bg-foreground/8">
							<div
								class="h-full rounded-full {step.worst ? 'bg-destructive' : 'bg-ring/80'}"
								style="width: {Math.max(step.count > 0 ? 1 : 0, width)}%"
							></div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Джерела: кожен рядок — та сама воронка, плюс конверсія в замовлення. -->
		<div class="space-y-3">
			<h2 class="px-1 text-sm font-medium">Джерела</h2>

			<div class="overflow-x-auto rounded-[20px] bg-muted/50">
				<table class="w-full min-w-[560px] text-sm">
					<thead>
						<tr class="text-left text-xs text-muted-foreground">
							<th class="px-4 pt-3 pb-2 font-normal">Джерело</th>
							{#each FUNNEL_STEPS as step (step.key)}
								<th class="px-2 pt-3 pb-2 text-right font-normal">{step.label}</th>
							{/each}
							<th class="px-4 pt-3 pb-2 text-right font-normal">Конверсія</th>
						</tr>
					</thead>
					<tbody>
						{#each ready.sources as row (row.source)}
							<tr
								class="border-t border-foreground/10 {data.source === row.source
									? 'bg-primary/5'
									: ''}"
							>
								<td class="px-4 py-2.5 font-medium">{sourceLabel(row.source)}</td>
								{#each row.funnel as step (step.key)}
									<td class="px-2 py-2.5 text-right tabular-nums">
										<span class={step.worst ? 'font-medium text-destructive' : ''}>
											{number(step.count)}
										</span>
										{#if step.pass !== null}
											<span
												class="block text-[11px] {step.worst
													? 'text-destructive'
													: 'text-muted-foreground'}"
											>
												{step.pass}%
											</span>
										{/if}
									</td>
								{/each}
								<td class="px-4 py-2.5 text-right font-medium tabular-nums">
									{percent(row.conversion)}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			{#if hasFacebook}
				<p class="px-1 text-xs text-muted-foreground">
					Facebook Ads Manager порівнюйте не з «Кліками», а з «Переглядами цільової сторінки». Один
					в один цифри не збіжуться — у Facebook своя модель підрахунку.
				</p>
			{/if}
		</div>

		<!-- Товари: видно, що дивляться, але не беруть. -->
		<div class="space-y-3">
			<h2 class="px-1 text-sm font-medium">Товари</h2>

			{#if ready.products.length === 0}
				<div class="rounded-[20px] bg-muted/50 px-5 py-8 text-center text-sm text-muted-foreground">
					Товари за цей період не переглядали
				</div>
			{:else}
				<div class="overflow-hidden rounded-[20px] bg-muted/50">
					<div
						class="flex items-center gap-3 px-4 pt-3 pb-2 text-xs text-muted-foreground"
						aria-hidden="true"
					>
						<span class="flex-1">Товар</span>
						<span class="w-16 text-right">Дивились</span>
						<span class="w-16 text-right">У кошик</span>
						<span class="w-12 text-right">%</span>
						<span class="w-4"></span>
					</div>

					{#each ready.products as item (item.path)}
						<svelte:element
							this={item.id ? 'a' : 'div'}
							href={item.id ? `/products/${item.id}` : undefined}
							class="flex items-center gap-3 border-t border-foreground/10 px-4 py-2.5 {item.id
								? 'transition-colors hover:bg-foreground/3'
								: ''}"
						>
							{#if item.image}
								<img
									src={cloudinaryThumb(item.image, 72)}
									alt=""
									loading="lazy"
									class="size-9 shrink-0 rounded-lg bg-foreground/5 object-cover"
								/>
							{:else}
								<span
									class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-muted-foreground/50"
								>
									<ImageOff size={14} />
								</span>
							{/if}
							<span class="min-w-0 flex-1 truncate">{item.name}</span>
							<span class="w-16 text-right tabular-nums">{number(item.viewed)}</span>
							<span class="w-16 text-right tabular-nums">{number(item.added)}</span>
							<span
								class="w-12 text-right text-muted-foreground tabular-nums {item.viewed >= 10 &&
								(item.rate ?? 0) === 0
									? 'text-destructive'
									: ''}"
							>
								{percent(item.rate)}
							</span>
							<span class="w-4">
								{#if item.id}<ChevronRight size={15} class="text-muted-foreground/40" />{/if}
							</span>
						</svelte:element>
					{/each}
				</div>
			{/if}
		</div>

		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Де йдуть: остання сторінка візиту в тих, хто не замовив. -->
			<div class="space-y-4 rounded-[20px] bg-muted/50 p-5">
				<h2 class="text-sm font-medium">Де йдуть</h2>

				{#if ready.exits.length === 0}
					<p class="text-sm text-muted-foreground">Усі, хто зайшов, замовили</p>
				{:else}
					<div class="space-y-2.5">
						{#each ready.exits as exit (exit.page)}
							<div class="space-y-1">
								<div class="flex justify-between text-sm">
									<span>{exit.label}</span>
									<span class="tabular-nums">
										<span class="text-xs text-muted-foreground">{exit.share}%</span>
										{number(exit.count)}
									</span>
								</div>
								<div class="h-1.5 overflow-hidden rounded-full bg-foreground/8">
									<div class="h-full rounded-full bg-ring/70" style="width: {exit.share}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Пристрої -->
			<div class="space-y-4 rounded-[20px] bg-muted/50 p-5">
				<h2 class="text-sm font-medium">Пристрої</h2>

				<div class="flex h-2 overflow-hidden rounded-full bg-foreground/8">
					{#each ready.devices as item, index (item.device)}
						<span
							class={index === 0 ? 'bg-ring/80' : 'bg-foreground/25'}
							style="width: {item.share}%"
						></span>
					{/each}
				</div>

				<div class="space-y-2">
					{#each ready.devices as item, index (item.device)}
						<div class="flex items-center gap-2.5 text-sm">
							<span
								class="size-2 shrink-0 rounded-full {index === 0
									? 'bg-ring/80'
									: 'bg-foreground/25'}"
							></span>
							<span class="flex-1">{item.label}</span>
							<span class="text-xs text-muted-foreground tabular-nums">{item.share}%</span>
							<span class="w-10 text-right tabular-nums">{number(item.visitors)}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>
