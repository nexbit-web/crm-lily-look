<script lang="ts">
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import {
		ChevronRight,
		Eye,
		ImageOff,
		Layers,
		LogOut,
		MonitorSmartphone,
		MousePointerClick,
		RefreshCw,
		ShoppingBag,
		ShoppingCart,
		TrendingUp,
		Users
	} from '@lucide/svelte';
	import SourceIcon from '$lib/components/source-icon.svelte';
	import BarChart from '$lib/components/bar-chart.svelte';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import { cell, headRow } from '$lib/table';
	import {
		FUNNEL_STEPS,
		RANGES,
		RANGE_LABELS,
		SOURCES,
		SOURCE_LABELS,
		type FunnelStep,
		type RangeKey,
		type SourceKey
	} from '$lib/traffic';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	let { data }: { data: Loaded<PageData> } = $props();

	let refreshing = $state(false);
	const busy = $derived(refreshing || navigating.to?.url.pathname === '/traffic');
	const ready = $derived(data.state === 'ready' ? data : null);

	// Власний період правимо локально й застосовуємо кнопкою: інакше кожна
	// зміна дати смикала б звіт посеред вибору.
	let customOpen = $state(false);
	let customFrom = $state('');
	let customTo = $state('');

	const showCustom = $derived(customOpen || data.range.key === 'custom');

	const hasFacebook = $derived(
		data.source === 'facebook' || (ready?.sources.some((row) => row.source === 'facebook') ?? false)
	);

	const peak = $derived(Math.max(0, ...(ready?.series ?? []).map((point) => point.visitors)));

	const chartPoints = $derived(
		(ready?.series ?? []).map((point) => ({
			label: dayLabel(point.key),
			value: point.visitors,
			detail: `${number(point.views)} переглядів`
		}))
	);

	/** Картка в стилі ClickUp: тонка рамка, шапка з назвою через лінію. */
	const card = 'overflow-hidden rounded-[12px] border border-border bg-card';
	const cardHead = 'flex h-11 items-center gap-2 border-b border-border px-4';
	const cardTitle = 'text-[13px] font-semibold tracking-tight';
	/** Рядок таблиці всередині картки: лінія знизу, підсвітка під курсором. */
	const row = 'grid h-9 border-b border-border text-[13px] transition-colors hover:bg-foreground/3';
	const num = `${cell} justify-end tabular-nums`;

	const sourceColumns =
		'grid-cols-[minmax(170px,1.4fr)_repeat(5,minmax(104px,1fr))_minmax(104px,0.8fr)]';

	/**
	 * Свіжі дані без перезавантаження: SvelteKit повторює завантаження
	 * сторінки з тими самими параметрами, а все на екрані лишається на місці.
	 */
	async function refresh() {
		if (refreshing) return;
		refreshing = true;
		try {
			// Спершу скидаємо кеш звіту на сервері — інакше «Оновити» віддало б
			// ті самі дані з Redis.
			await fetch('/traffic/refresh', { method: 'POST' });
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

	function number(value: number) {
		return value.toLocaleString('uk-UA');
	}
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

{#snippet sourceTab(key: SourceKey | null, label: string)}
	{@const active = data.source === key}
	<button
		type="button"
		aria-pressed={active}
		class="relative flex h-10 items-center gap-1.5 rounded-[6px] px-2 text-[13px] transition-colors {active
			? 'font-semibold text-foreground'
			: 'font-medium text-muted-foreground hover:text-foreground'}"
		onclick={() => pickSource(key)}
	>
		{#if key}
			<SourceIcon source={key} size={15} />
		{:else}
			<Layers size={15} class={active ? 'text-foreground' : ''} />
		{/if}
		{label}
		{#if active}
			<span class="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-foreground"></span>
		{/if}
	</button>
{/snippet}

{#snippet funnelRow(
	icon: string,
	label: string,
	steps: FunnelStep[],
	conversion: number | null,
	selected = false
)}
	<div class="{row} {sourceColumns} {selected ? 'bg-primary/6 hover:bg-primary/8' : ''}" role="row">
		<span class="{cell} gap-2 font-medium" role="cell">
			<SourceIcon source={icon} size={15} />
			<span class="truncate">{label}</span>
		</span>
		{#each steps as step (step.key)}
			<span class="{num} gap-1.5" role="cell">
				{number(step.count)}
				{#if step.pass !== null}
					<span
						class="text-[11px] {step.worst
							? 'font-semibold text-destructive'
							: 'text-muted-foreground'}"
					>
						{step.pass}%
					</span>
				{/if}
			</span>
		{/each}
		<span class={num} role="cell">
			<span
				class="inline-flex h-5 items-center rounded-[6px] bg-primary/10 px-1.5 text-[12px] font-semibold text-primary"
			>
				{percent(conversion)}
			</span>
		</span>
	</div>
{/snippet}

{#snippet tile(label: string, value: string, Icon: typeof Users, note?: string)}
	<div class="flex flex-col gap-1.5 bg-card px-4 py-3.5">
		<span class="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
			<Icon size={13} />
			{label}
		</span>
		<span class="flex flex-wrap items-baseline gap-2">
			<span class="text-[22px] leading-7 font-semibold tracking-tight tabular-nums">{value}</span>
			{#if note}<span class="text-[11px] text-muted-foreground">{note}</span>{/if}
		</span>
	</div>
{/snippet}

<div class="flex flex-col gap-3 pb-6 transition-opacity {busy ? 'opacity-60' : ''}">
	<div class="flex h-8 flex-wrap items-center gap-2">
		<h1 class="text-[17px] font-semibold tracking-tight">Відвідуваність</h1>
		<button
			type="button"
			class="flex size-7 items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground disabled:opacity-50"
			aria-label="Оновити дані"
			title="Оновити дані"
			disabled={busy}
			onclick={refresh}
		>
			<RefreshCw size={14} class={busy ? 'animate-spin' : ''} />
		</button>

		<!-- Періоди: сегментований перемикач, як на статистиці. -->
		<div class="ml-auto flex h-7 rounded-[8px] bg-foreground/6 p-0.5">
			{#each RANGES as key (key)}
				{@const active = key === 'custom' ? showCustom : !showCustom && data.range.key === key}
				<button
					type="button"
					aria-pressed={active}
					class="rounded-[6px] px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors {active
						? 'bg-card text-foreground shadow-sm ring-1 ring-border'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => pickRange(key)}
				>
					{RANGE_LABELS[key]}
				</button>
			{/each}
		</div>
	</div>

	<!--
		Джерела — вкладки, як види в ClickUp (List · Board · Table): смуга на всю
		ширину панелі, іконка й назва, під вибраною — темна риска. Власні дати —
		праворуч у тій самій смузі.
	-->
	<nav
		aria-label="Джерела"
		class="-mr-2 -ml-3 flex flex-wrap items-center gap-x-1 border-b border-border pr-2 pl-1.5"
	>
		{@render sourceTab(null, 'Усі джерела')}
		<span class="mx-1 h-4 w-px bg-border" aria-hidden="true"></span>
		{#each SOURCES as key (key)}
			{@render sourceTab(key, SOURCE_LABELS[key])}
		{/each}

		{#if showCustom}
			<form
				class="ml-auto flex items-center gap-1.5 py-1"
				onsubmit={(event) => {
					event.preventDefault();
					applyCustom();
				}}
			>
				<input
					type="date"
					bind:value={customFrom}
					max={data.today}
					aria-label="Від"
					class="h-7 rounded-[6px] border border-border bg-card px-2 text-[12px] outline-none focus:border-primary"
				/>
				<span class="text-[12px] text-muted-foreground">—</span>
				<input
					type="date"
					bind:value={customTo}
					max={data.today}
					aria-label="До"
					class="h-7 rounded-[6px] border border-border bg-card px-2 text-[12px] outline-none focus:border-primary"
				/>
				<button
					type="submit"
					class="h-7 rounded-[6px] bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
				>
					Показати
				</button>
			</form>
		{/if}
	</nav>

	{#if !ready}
		<div class="{card} flex flex-col items-center gap-2 px-6 py-16 text-center">
			<Eye size={24} class="text-muted-foreground/40" />
			<p class="text-[13px] text-muted-foreground">Даних поки немає</p>
		</div>
	{:else}
		<!-- Головний блок: п’ять показників і графік відвідувачів під ними. -->
		<section class={card}>
			<div
				class="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-3 lg:grid-cols-5"
			>
				{@render tile('Відвідувачі', number(ready.totals.visitors), Users)}
				{@render tile('Перегляди', number(ready.totals.views), MousePointerClick)}
				{@render tile('Додали в кошик', number(ready.totals.added), ShoppingCart)}
				{@render tile(
					'Замовили',
					number(ready.totals.ordered),
					ShoppingBag,
					`у CRM: ${ready.crmOrders}`
				)}
				{@render tile('Конверсія', percent(ready.totals.conversion), TrendingUp)}
			</div>

			{#if chartPoints.length > 1}
				<div class="px-4 pt-3 pb-2">
					<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
						<h2 class={cardTitle}>Відвідувачі по днях</h2>
						<p class="text-[12px] text-muted-foreground tabular-nums">
							пік {number(peak)} · наведіть на стовпчик, щоб побачити перегляди
						</p>
					</div>
					<BarChart points={chartPoints} format={(value) => `${number(value)} відвідувачів`} />
				</div>
			{:else}
				<p class="px-4 py-3 text-[12px] text-muted-foreground">
					Графік по днях — для періоду від двох днів.
				</p>
			{/if}
		</section>

		<!--
			Воронка — головний звіт. Кожен крок — стовпчик від спільної основи:
			заливка — ті, хто дійшов, світла частина над нею — ті, хто відпав на
			цьому кроці. Між кроками — яка частка пройшла далі; найбільший провал
			червоний.
		-->
		{@const base = ready.funnel[0].count}
		<section class={card}>
			<header class={cardHead}>
				<h2 class={cardTitle}>Воронка</h2>
				<span class="ml-auto text-[12px] text-muted-foreground">
					від входу до замовлення — {percent(ready.totals.conversion)}
				</span>
			</header>

			<div class="overflow-x-auto p-4">
				<div class="flex min-w-155">
					{#each ready.funnel as step, index (step.key)}
						{#if index > 0}
							<div class="flex w-12 shrink-0 flex-col">
								<div class="h-13"></div>
								<div class="flex h-40 items-center justify-center">
									<span
										class="flex h-5 items-center gap-0.5 rounded-[6px] px-1 text-[11px] font-semibold tabular-nums {step.worst
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
							<div class="h-13">
								<p
									class="truncate text-[12px] font-medium {step.worst
										? 'text-destructive'
										: 'text-muted-foreground'}"
								>
									{step.label}
								</p>
								<p class="mt-0.5 text-[20px] font-semibold tracking-tight tabular-nums">
									{number(step.count)}
								</p>
							</div>

							<div class="relative h-40 overflow-hidden rounded-[8px] bg-foreground/4">
								<!-- Хто відпав саме на цьому кроці. -->
								<div
									class="absolute inset-x-0 bottom-0 {step.worst
										? 'bg-destructive/15'
										: 'bg-primary/12'}"
									style:height="{previous}%"
								></div>
								<!-- Хто дійшов. -->
								<div
									class="absolute inset-x-0 bottom-0 rounded-t-[4px] transition-[height] duration-500 {step.worst
										? 'bg-destructive'
										: 'bg-primary'}"
									style:height="{step.count > 0 ? Math.max(1.5, fill) : 0}%"
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

		<!-- Джерела: кожен рядок — та сама воронка, плюс конверсія в замовлення. -->
		<section class={card}>
			<header class={cardHead}>
				<h2 class={cardTitle}>Джерела</h2>
				<span class="text-[12px] text-muted-foreground tabular-nums">{ready.sources.length}</span>
				{#if hasFacebook}
					<span class="ml-auto hidden truncate text-[12px] text-muted-foreground md:block">
						Facebook Ads порівнюйте з «Переглядами цільової сторінки», а не з «Кліками».
					</span>
				{/if}
			</header>

			<!-- Лише горизонтальна прокрутка: -mb-px ховає нижню лінію таблиці під
			     рамкою картки, і без overflow-y-hidden цей піксель давав вертикальний скролбар. -->
			<div class="overflow-x-auto overflow-y-hidden">
				<div class="-mb-px min-w-205" role="table" aria-label="Джерела">
					<div class="{headRow} {sourceColumns}" role="row">
						<span class={cell} role="columnheader">Джерело</span>
						{#each FUNNEL_STEPS as step (step.key)}
							<span class="{cell} justify-end" role="columnheader">{step.label}</span>
						{/each}
						<span class="{cell} justify-end" role="columnheader">Конверсія</span>
					</div>

					{#each ready.sources as source (source.source)}
						{@render funnelRow(
							source.source,
							sourceLabel(source.source),
							source.funnel,
							source.conversion,
							data.source === source.source
						)}
					{/each}

					{#if ready.wheel}
						<!-- Колесо — не джерело, а подія на сайті. Окрема група, як статус у
						     списку ClickUp: плашка з назвою й лічильники поруч. -->
						<div class="flex h-10 items-center gap-2 border-b border-border px-2">
							<span
								class="inline-flex h-5.5 items-center gap-1 rounded-[6px] bg-violet/15 px-2 text-[11px] font-semibold tracking-wide text-violet uppercase"
							>
								<SourceIcon source="wheel" size={12} />
								Колесо фортуни
							</span>
							<span class="text-[12px] text-muted-foreground tabular-nums">
								побачили {number(ready.wheel.seen)} · крутили {number(ready.wheel.spun)}
								({percent(ready.wheel.spunRate)})
							</span>
						</div>
						{#each ready.wheel.rows as wheelRow (wheelRow.group)}
							{@render funnelRow('wheel', wheelRow.label, wheelRow.funnel, wheelRow.conversion)}
						{/each}
					{/if}
				</div>
			</div>
		</section>

		<div class="grid gap-3 xl:grid-cols-2">
			<!-- Товари: видно, що дивляться, але не беруть. -->
			<section class={card}>
				<header class={cardHead}>
					<h2 class={cardTitle}>Товари</h2>
					<span class="ml-auto text-[12px] text-muted-foreground">дивились → у кошик</span>
				</header>

				{#if ready.products.length === 0}
					<p class="px-4 py-10 text-center text-[13px] text-muted-foreground">
						Товари за цей період не переглядали
					</p>
				{:else}
					<div class="-mb-px">
						<div class="{headRow} grid-cols-[minmax(0,1fr)_88px_88px_72px]" role="row">
							<span class={cell}>Товар</span>
							<span class="{cell} justify-end">Дивились</span>
							<span class="{cell} justify-end">У кошик</span>
							<span class="{cell} justify-end">%</span>
						</div>
						{#each ready.products as item (item.path)}
							<!-- Багато переглядів і жодного кошика — червона плашка. -->
							{@const cold = item.viewed >= 10 && (item.rate ?? 0) === 0}
							<svelte:element
								this={item.id ? 'a' : 'div'}
								href={item.id ? `/products/${item.id}` : undefined}
								class="{row} h-10 grid-cols-[minmax(0,1fr)_88px_88px_72px]"
							>
								<span class="{cell} gap-2">
									{#if item.image}
										<img
											src={cloudinaryThumb(item.image, 48)}
											alt=""
											loading="lazy"
											class="size-6 shrink-0 rounded-[6px] bg-foreground/5 object-cover"
										/>
									{:else}
										<span
											class="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-foreground/6 text-muted-foreground/50"
										>
											<ImageOff size={11} />
										</span>
									{/if}
									<span class="truncate font-medium">{item.name}</span>
								</span>
								<span class={num}>{number(item.viewed)}</span>
								<span class={num}>{number(item.added)}</span>
								<span class={num}>
									<span
										class="inline-flex h-5 items-center rounded-[6px] px-1.5 text-[11px] font-semibold {cold
											? 'bg-destructive/12 text-destructive'
											: 'bg-foreground/6 text-muted-foreground'}"
									>
										{percent(item.rate)}
									</span>
								</span>
							</svelte:element>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Сторінки: усі відкриті адреси, найпопулярніші зверху. Без переглядів
			     блоку немає зовсім — порожня рамка нічого не каже. -->
			{#if ready.pages.length > 0}
				<section class={card}>
					<header class={cardHead}>
						<h2 class={cardTitle}>Сторінки</h2>
						<span class="ml-auto text-[12px] text-muted-foreground">найпопулярніші зверху</span>
					</header>

					<div class="-mb-px">
						<div class="{headRow} grid-cols-[minmax(0,1fr)_96px_96px]" role="row">
							<span class={cell}>Сторінка</span>
							<span class="{cell} justify-end">Перегляди</span>
							<span class="{cell} justify-end">Відвідувачі</span>
						</div>
						{#each ready.pages as item (item.path)}
							<div class="{row} grid-cols-[minmax(0,1fr)_96px_96px]">
								<span class="{cell} gap-2">
									<span class="shrink-0 font-medium">{item.label}</span>
									<span class="truncate font-mono text-[11px] text-muted-foreground">
										{item.path}
									</span>
								</span>
								<span class={num}>{number(item.views)}</span>
								<span class={num}>{number(item.visitors)}</span>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>

		<div class="grid gap-3 lg:grid-cols-2">
			<!-- Де йдуть: остання сторінка візиту в тих, хто не замовив. -->
			<section class={card}>
				<header class={cardHead}>
					<LogOut size={14} class="text-muted-foreground" />
					<h2 class={cardTitle}>Де йдуть</h2>
					<span class="ml-auto text-[12px] text-muted-foreground"
						>остання сторінка без замовлення</span
					>
				</header>

				{#if ready.exits.length === 0}
					<p class="px-4 py-10 text-center text-[13px] text-muted-foreground">
						Усі, хто зайшов, замовили
					</p>
				{:else}
					<div class="space-y-3 p-4">
						{#each ready.exits as exit (exit.page)}
							<div class="space-y-1.5">
								<div class="flex items-baseline justify-between text-[13px]">
									<span>{exit.label}</span>
									<span class="flex items-baseline gap-2 tabular-nums">
										<span class="text-[12px] text-muted-foreground">{exit.share}%</span>
										<span class="w-10 text-right font-medium">{number(exit.count)}</span>
									</span>
								</div>
								<div class="h-1 overflow-hidden rounded-full bg-foreground/6">
									<div class="h-full rounded-full bg-primary" style:width="{exit.share}%"></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Пристрої -->
			<section class={card}>
				<header class={cardHead}>
					<MonitorSmartphone size={14} class="text-muted-foreground" />
					<h2 class={cardTitle}>Пристрої</h2>
				</header>

				<div class="space-y-3 p-4">
					<div class="flex h-2 gap-0.5 overflow-hidden rounded-full">
						{#each ready.devices as item, index (item.device)}
							<span
								class="h-full first:rounded-l-full last:rounded-r-full {index === 0
									? 'bg-primary'
									: 'bg-foreground/20'}"
								style:width="{item.share}%"
							></span>
						{/each}
					</div>

					<div class="space-y-0.5">
						{#each ready.devices as item, index (item.device)}
							<div class="flex h-8 items-center gap-2.5 px-1 text-[13px]">
								<span
									class="size-2 shrink-0 rounded-full {index === 0
										? 'bg-primary'
										: 'bg-foreground/20'}"
								></span>
								<span class="flex-1">{item.label}</span>
								<span class="w-10 text-right text-[12px] text-muted-foreground tabular-nums">
									{item.share}%
								</span>
								<span class="w-12 text-right font-medium tabular-nums">{number(item.visitors)}</span
								>
							</div>
						{/each}
					</div>
				</div>
			</section>
		</div>
	{/if}
</div>
