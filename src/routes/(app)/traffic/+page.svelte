<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { Check, ChevronRight, ImageOff, Eye, RefreshCw } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import SourceIcon from '$lib/components/source-icon.svelte';
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

	// Таблиці як список у Finder: тиха шапка з тонкими розділювачами колонок,
	// рядки через один підсвічені, без ліній між ними. Фон — як у решти блоків.
	const sheet = 'rounded-[20px] bg-muted/50 px-2 pb-2';
	const head =
		'h-9 border-b border-foreground/8 px-3 text-xs leading-9 font-medium whitespace-nowrap text-muted-foreground';
	const divider =
		'relative before:absolute before:inset-y-2.5 before:left-0 before:w-px before:bg-foreground/10';
	const stripe = 'transition-colors odd:bg-foreground/[0.035] hover:bg-foreground/6';

	let refreshing = $state(false);
	const busy = $derived(refreshing || navigating.to?.url.pathname === '/traffic');
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

	/**
	 * Свіжі дані без перезавантаження: SvelteKit повторює завантаження
	 * сторінки з тими самими параметрами, а все на екрані лишається на місці.
	 */
	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

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
	/** Висота стовпчика у % від першого кроку. */
	const level = (count: number, base: number) => (base === 0 ? 0 : (count / base) * 100);

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

{#snippet chip(label: string, active: boolean, onclick: () => void, source?: string)}
	<button
		type="button"
		aria-pressed={active}
		class="flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors {active
			? 'bg-primary text-primary-foreground'
			: 'bg-muted/60 text-muted-foreground hover:text-foreground'}"
		{onclick}
	>
		{#if source}
			<SourceIcon {source} size={13} mono={active} />
		{:else if active}
			<Check size={13} strokeWidth={2.5} />
		{/if}
		{label}
	</button>
{/snippet}

{#snippet tile(label: string, value: string, note?: string, accent = false)}
	<div class="space-y-1 bg-card px-4 py-4">
		<p class="text-xs text-muted-foreground">{label}</p>
		<p class="text-xl font-semibold tracking-tight tabular-nums {accent ? 'text-primary' : ''}">
			{value}
		</p>
		{#if note}<p class="text-[11px] text-muted-foreground/70">{note}</p>{/if}
	</div>
{/snippet}

<div class="space-y-6 pb-12 transition-opacity {busy ? 'opacity-60' : ''}">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<h1 class="text-2xl font-semibold tracking-tight">Відвідуваність</h1>
			<Button
				variant="ghost"
				size="icon-sm"
				class="rounded-full text-muted-foreground"
				aria-label="Оновити дані"
				title="Оновити дані"
				disabled={busy}
				onclick={refresh}
			>
				<RefreshCw size={16} class={busy ? 'animate-spin' : ''} />
			</Button>
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
			class="flex flex-wrap items-center justify-end gap-2"
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
			{@render chip(SOURCE_LABELS[key], data.source === key, () => pickSource(key), key)}
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
			{@render tile('Конверсія', percent(ready.totals.conversion), undefined, true)}
		</div>

		<!--
			Воронка — головний звіт. Кожен крок — стовпчик від спільної основи:
			заливка — ті, хто дійшов, світла частина над нею — ті, хто відпав на
			цьому кроці. Між кроками — яка частка пройшла далі; найбільший провал
			червоний.
		-->
		{@const base = ready.funnel[0].count}
		<section class="space-y-5 rounded-[20px] bg-muted/50 p-5">
			<h2 class="text-sm font-medium">Воронка</h2>

			<div class="overflow-x-auto">
				<div class="flex min-w-[620px]">
					{#each ready.funnel as step, index (step.key)}
						{#if index > 0}
							<div class="flex w-14 shrink-0 flex-col">
								<div class="h-14"></div>
								<div class="flex h-44 items-center justify-center">
									<span
										class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums {step.worst
											? 'bg-destructive/12 text-destructive'
											: 'bg-foreground/6 text-muted-foreground'}"
										title="Пройшли далі з попереднього кроку"
									>
										<ChevronRight size={11} strokeWidth={2.5} />{percent(step.pass)}
									</span>
								</div>
							</div>
						{/if}

						{@const fill = level(step.count, base)}
						{@const previous = index === 0 ? fill : level(ready.funnel[index - 1].count, base)}
						<div class="min-w-0 flex-1">
							<div class="h-14">
								<p
									class="truncate text-xs {step.worst
										? 'font-medium text-destructive'
										: 'text-muted-foreground'}"
								>
									{step.label}
								</p>
								<p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
									{number(step.count)}
								</p>
							</div>

							<div class="relative h-44 overflow-hidden rounded-[14px] bg-foreground/5">
								<!-- Хто відпав саме на цьому кроці. -->
								<div
									class="absolute inset-x-0 bottom-0 {step.worst
										? 'bg-destructive/15'
										: 'bg-ring/15'}"
									style="height: {previous}%"
								></div>
								<!-- Хто дійшов. -->
								<div
									class="absolute inset-x-0 bottom-0 rounded-t-[6px] transition-[height] duration-500 {step.worst
										? 'bg-destructive'
										: 'bg-ring'}"
									style="height: {step.count > 0 ? Math.max(1.5, fill) : 0}%"
								></div>
							</div>

							<p class="mt-2 text-[11px] text-muted-foreground tabular-nums">
								{index === 0 ? '100%' : `${Math.round(fill)}% від усіх`}
							</p>
						</div>
					{/each}
				</div>
			</div>
		</section>

		{#if ready.series.length > 1}
			<section class="space-y-4 rounded-[20px] bg-muted/50 p-5">
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
			</section>
		{/if}

		<!-- Джерела: кожен рядок — та сама воронка, плюс конверсія в замовлення. -->
		<section class="space-y-3">
			<h2 class="px-1 text-sm font-medium">Джерела</h2>

			<div class="{sheet} overflow-x-auto">
				<table class="w-full min-w-170 border-separate border-spacing-0 text-[13px]">
					<thead>
						<tr>
							<th class="{head} text-left">Джерело</th>
							{#each FUNNEL_STEPS as step (step.key)}
								<th class="{head} {divider} text-right">{step.label}</th>
							{/each}
							<th class="{head} {divider} text-right">Конверсія</th>
						</tr>
						<!-- Відступ між шапкою й першим рядком, як у Finder. -->
						<tr aria-hidden="true"><td class="h-1.5 p-0" colspan={FUNNEL_STEPS.length + 2}></td></tr
						>
					</thead>
					<tbody>
						{#each ready.sources as row (row.source)}
							<tr
								class="{stripe} {data.source === row.source
									? 'bg-primary/10! hover:bg-primary/12!'
									: ''}"
							>
								<td class="h-9 rounded-l-[10px] px-3">
									<span class="flex items-center gap-2.5">
										<SourceIcon source={row.source} size={16} />
										{sourceLabel(row.source)}
									</span>
								</td>
								{#each row.funnel as step (step.key)}
									<td class="h-9 px-3 text-right whitespace-nowrap tabular-nums">
										{number(step.count)}
										{#if step.pass !== null}
											<span
												class="ml-1 text-[11px] {step.worst
													? 'font-medium text-destructive'
													: 'text-muted-foreground'}"
											>
												{step.pass}%
											</span>
										{/if}
									</td>
								{/each}
								<td class="h-9 rounded-r-[10px] px-3 text-right">
									<span
										class="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary tabular-nums"
									>
										{percent(row.conversion)}
									</span>
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
		</section>

		<!-- Сторінки: усі відкриті адреси, найпопулярніші зверху. -->
		{#if ready.pages.length > 0}
			<section class="space-y-3">
				<h2 class="px-1 text-sm font-medium">Сторінки</h2>

				<div class={sheet}>
					<div class="flex items-center text-[13px]" aria-hidden="true">
						<span class="{head} flex-1">Сторінка</span>
						<span class="{head} {divider} w-28 text-right">Перегляди</span>
						<span class="{head} {divider} w-28 text-right">Відвідувачі</span>
					</div>

					<div class="pt-1.5">
						{#each ready.pages as item (item.path)}
							<div class="{stripe} flex h-9 items-center rounded-[10px] text-[13px]">
								<span class="flex min-w-0 flex-1 items-baseline gap-2 px-3">
									<span class="shrink-0">{item.label}</span>
									<span class="truncate text-xs text-muted-foreground">{item.path}</span>
								</span>
								<span class="w-28 px-3 text-right tabular-nums">{number(item.views)}</span>
								<span class="w-28 px-3 text-right tabular-nums">{number(item.visitors)}</span>
							</div>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		<!-- Товари: видно, що дивляться, але не беруть. -->
		<section class="space-y-3">
			<h2 class="px-1 text-sm font-medium">Товари</h2>

			{#if ready.products.length === 0}
				<div class="rounded-[20px] bg-muted/50 px-5 py-8 text-center text-sm text-muted-foreground">
					Товари за цей період не переглядали
				</div>
			{:else}
				<div class={sheet}>
					<div class="flex items-center text-[13px]" aria-hidden="true">
						<span class="{head} flex-1">Товар</span>
						<span class="{head} {divider} w-24 text-right">Дивились</span>
						<span class="{head} {divider} w-24 text-right">У кошик</span>
						<span class="{head} {divider} w-20 text-right">%</span>
					</div>

					<div class="pt-1.5">
						{#each ready.products as item (item.path)}
							{@const cold = item.viewed >= 10 && (item.rate ?? 0) === 0}
							<svelte:element
								this={item.id ? 'a' : 'div'}
								href={item.id ? `/products/${item.id}` : undefined}
								class="{stripe} flex h-10 items-center rounded-[10px] text-[13px]"
							>
								<span class="flex min-w-0 flex-1 items-center gap-2.5 px-3">
									{#if item.image}
										<img
											src={cloudinaryThumb(item.image, 56)}
											alt=""
											loading="lazy"
											class="size-7 shrink-0 rounded-md bg-foreground/5 object-cover"
										/>
									{:else}
										<span
											class="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/5 text-muted-foreground/50"
										>
											<ImageOff size={12} />
										</span>
									{/if}
									<span class="truncate">{item.name}</span>
								</span>
								<span class="w-24 px-3 text-right tabular-nums">{number(item.viewed)}</span>
								<span class="w-24 px-3 text-right tabular-nums">{number(item.added)}</span>
								<span class="w-20 px-3 text-right">
									<span
										class="inline-block rounded-full px-2 py-0.5 text-xs font-medium tabular-nums {cold
											? 'bg-destructive/12 text-destructive'
											: 'bg-foreground/6 text-muted-foreground'}"
									>
										{percent(item.rate)}
									</span>
								</span>
							</svelte:element>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Де йдуть: остання сторінка візиту в тих, хто не замовив. -->
			<section class="space-y-4 rounded-[20px] bg-muted/50 p-5">
				<h2 class="text-sm font-medium">Де йдуть</h2>

				{#if ready.exits.length === 0}
					<p class="text-sm text-muted-foreground">Усі, хто зайшов, замовили</p>
				{:else}
					<div class="space-y-3">
						{#each ready.exits as exit (exit.page)}
							<div class="space-y-1.5">
								<div class="flex items-baseline justify-between text-sm">
									<span>{exit.label}</span>
									<span class="flex items-baseline gap-2 tabular-nums">
										<span class="text-xs text-muted-foreground">{exit.share}%</span>
										<span class="font-medium">{number(exit.count)}</span>
									</span>
								</div>
								<div class="h-1.5 overflow-hidden rounded-full bg-foreground/6">
									<div class="h-full rounded-full bg-ring/70" style="width: {exit.share}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Пристрої -->
			<section class="space-y-4 rounded-[20px] bg-muted/50 p-5">
				<h2 class="text-sm font-medium">Пристрої</h2>

				<div class="flex h-2 gap-0.5 overflow-hidden rounded-full">
					{#each ready.devices as item, index (item.device)}
						<span
							class="rounded-full {index === 0 ? 'bg-ring' : 'bg-foreground/20'}"
							style="width: {item.share}%"
						></span>
					{/each}
				</div>

				<div class="space-y-2.5">
					{#each ready.devices as item, index (item.device)}
						<div class="flex items-center gap-2.5 text-sm">
							<span
								class="size-2 shrink-0 rounded-full {index === 0 ? 'bg-ring' : 'bg-foreground/20'}"
							></span>
							<span class="flex-1">{item.label}</span>
							<span class="text-xs text-muted-foreground tabular-nums">{item.share}%</span>
							<span class="w-10 text-right font-medium tabular-nums">{number(item.visitors)}</span>
						</div>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>
