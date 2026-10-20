<script lang="ts">
	import { niceMax, smoothPath } from '$lib/chart';

	/** label — коротко на осі, title — повністю в підказці («6 — 12 жовт»). */
	type ChartPoint = { label: string; title?: string; value: number; detail?: string };

	/**
	 * Лінійний графік: плавна лінія кольору теми з легкою заливкою, сітка з
	 * круглими підписами, під курсором — вертикаль, точка й підказка.
	 * Ширину бере з контейнера, тож текст не розтягується.
	 */
	let {
		points,
		format,
		formatAxis = format,
		height = 260
	}: {
		points: ChartPoint[];
		/** Значення в підказці: «12 400,00 ₴». */
		format: (value: number) => string;
		/** Коротко на осі: «12 тис». */
		formatAxis?: (value: number) => string;
		height?: number;
	} = $props();

	// Свій id градієнта: на сторінці може бути кілька графіків.
	const uid = $props.id();

	let width = $state(0);
	let hover = $state<number | null>(null);

	const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
	const GRID = 4;

	const top = $derived(niceMax(Math.max(0, ...points.map((point) => point.value))));
	const plotWidth = $derived(Math.max(0, width - PAD.left - PAD.right));
	const plotHeight = $derived(height - PAD.top - PAD.bottom);

	const x = (index: number) =>
		PAD.left + (points.length < 2 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
	const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;

	const coords = $derived(points.map((point, index) => ({ x: x(index), y: y(point.value) })));
	const line = $derived(smoothPath(coords));
	const area = $derived(
		coords.length > 1
			? `${line} L${coords.at(-1)!.x},${PAD.top + plotHeight} L${coords[0].x},${PAD.top + plotHeight} Z`
			: ''
	);

	/** Підписи осі X: до семи, рівномірно, перший і останній — завжди. */
	const ticks = $derived.by(() => {
		const count = Math.min(points.length, width < 520 ? 4 : 7);
		if (count < 2) return points.length ? [0] : [];
		return Array.from({ length: count }, (_, step) =>
			Math.round((step / (count - 1)) * (points.length - 1))
		);
	});

	function onpointermove(event: PointerEvent) {
		if (points.length === 0) return;
		const box = (event.currentTarget as SVGElement).getBoundingClientRect();
		const ratio = (event.clientX - box.left - PAD.left) / Math.max(1, plotWidth);
		hover = Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
	}

	const active = $derived(hover === null ? null : { ...points[hover], ...coords[hover] });
	/** Підказка не вилазить за край: біля правого краю — ліворуч від точки. */
	const tipLeft = $derived(active ? active.x > width - 180 : false);
</script>

<div class="relative w-full select-none" bind:clientWidth={width} style:height="{height}px">
	{#if width > 0}
		<svg
			{width}
			{height}
			class="block overflow-visible"
			role="img"
			aria-label="Графік"
			{onpointermove}
			onpointerleave={() => (hover = null)}
		>
			<defs>
				<linearGradient id="fill-{uid}" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.18" />
					<stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />
				</linearGradient>
			</defs>

			<!-- Сітка й підписи осі Y -->
			{#each Array.from({ length: GRID + 1 }, (_, step) => step) as step (step)}
				{@const value = (top / GRID) * step}
				<line
					x1={PAD.left}
					x2={width - PAD.right}
					y1={y(value)}
					y2={y(value)}
					class="stroke-border"
					stroke-dasharray={step === 0 ? undefined : '3 4'}
				/>
				<text
					x={PAD.left - 10}
					y={y(value)}
					text-anchor="end"
					dominant-baseline="middle"
					class="fill-muted-foreground text-[11px] tabular-nums"
				>
					{formatAxis(value)}
				</text>
			{/each}

			<!-- Підписи осі X -->
			{#each ticks as index (index)}
				<text
					x={x(index)}
					y={height - 8}
					text-anchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
					class="fill-muted-foreground text-[11px]"
				>
					{points[index].label}
				</text>
			{/each}

			{#if area}<path d={area} fill="url(#fill-{uid})" />{/if}
			<path
				d={line}
				fill="none"
				stroke="var(--color-primary)"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>

			{#if active}
				<line
					x1={active.x}
					x2={active.x}
					y1={PAD.top}
					y2={PAD.top + plotHeight}
					class="stroke-foreground/25"
					stroke-dasharray="3 3"
				/>
				<circle
					cx={active.x}
					cy={active.y}
					r="4.5"
					fill="var(--color-card)"
					stroke="var(--color-primary)"
					stroke-width="2"
				/>
			{/if}

			<!-- Прозора зона під курсором: ловить рух і над порожніми місцями. -->
			<rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} fill="transparent" />
		</svg>

		{#if active}
			<div
				class="pointer-events-none absolute z-10 min-w-36 rounded-[10px] border border-border bg-popover px-3 py-2 shadow-lg"
				style:left="{active.x}px"
				style:top="{Math.max(0, active.y - 12)}px"
				style:transform={tipLeft
					? 'translate(calc(-100% - 12px), -100%)'
					: 'translate(12px, -100%)'}
			>
				<p class="text-[11px] text-muted-foreground">{active.title ?? active.label}</p>
				<p class="text-[14px] font-semibold tabular-nums">{format(active.value)}</p>
				{#if active.detail}
					<p class="text-[11px] text-muted-foreground tabular-nums">{active.detail}</p>
				{/if}
			</div>
		{/if}
	{/if}
</div>
