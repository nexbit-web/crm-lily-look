<script lang="ts">
	import { niceMax } from '$lib/chart';

	/** label — коротко на осі, title — повністю в підказці. */
	type ChartPoint = { label: string; title?: string; value: number; detail?: string };

	/**
	 * Стовпчиковий графік у парі до LineChart: та сама сітка, підписи й
	 * підказка, лише замість лінії — стовпчик на кожен день. Під курсором
	 * стовпчик яскравий, решта трохи бліднуть.
	 */
	let {
		points,
		format,
		formatAxis = (value: number) => (Number.isInteger(value) ? value.toLocaleString('uk-UA') : ''),
		height = 240
	}: {
		points: ChartPoint[];
		format: (value: number) => string;
		formatAxis?: (value: number) => string;
		height?: number;
	} = $props();

	let width = $state(0);
	let hover = $state<number | null>(null);

	const PAD = { top: 12, right: 8, bottom: 26, left: 44 };
	const GRID = 4;

	const top = $derived(niceMax(Math.max(0, ...points.map((point) => point.value))));
	const plotWidth = $derived(Math.max(0, width - PAD.left - PAD.right));
	const plotHeight = $derived(height - PAD.top - PAD.bottom);
	const baseline = $derived(PAD.top + plotHeight);

	/** Крок між стовпчиками й ширина самого стовпчика: 60% кроку, не ширше 28 px. */
	const step = $derived(points.length ? plotWidth / points.length : 0);
	const barWidth = $derived(Math.max(2, Math.min(28, step * 0.6)));

	const center = (index: number) => PAD.left + step * index + step / 2;
	const y = (value: number) => baseline - (value / top) * plotHeight;

	/** Стовпчик із заокругленим верхом і рівним низом. Нуль — тонка риска. */
	function bar(index: number, value: number): string {
		const h = value > 0 ? Math.max(2, baseline - y(value)) : 2;
		const x = center(index) - barWidth / 2;
		const r = Math.min(4, barWidth / 2, h);
		const t = baseline - h;
		return `M${x},${baseline} V${t + r} Q${x},${t} ${x + r},${t} H${x + barWidth - r} Q${x + barWidth},${t} ${x + barWidth},${t + r} V${baseline} Z`;
	}

	/** Підписи осі X: до восьми, рівномірно. */
	const ticks = $derived.by(() => {
		const count = Math.min(points.length, width < 520 ? 4 : 8);
		if (count < 2) return points.length ? [0] : [];
		return Array.from({ length: count }, (_, index) =>
			Math.round((index / (count - 1)) * (points.length - 1))
		);
	});

	function onpointermove(event: PointerEvent) {
		if (points.length === 0 || step === 0) return;
		const box = (event.currentTarget as SVGElement).getBoundingClientRect();
		const index = Math.floor((event.clientX - box.left - PAD.left) / step);
		hover = index >= 0 && index < points.length ? index : null;
	}

	const active = $derived(
		hover === null ? null : { ...points[hover], x: center(hover), y: y(points[hover].value) }
	);
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
			{#each Array.from({ length: GRID + 1 }, (_, line) => line) as line (line)}
				{@const value = (top / GRID) * line}
				<line
					x1={PAD.left}
					x2={width - PAD.right}
					y1={y(value)}
					y2={y(value)}
					class="stroke-border"
					stroke-dasharray={line === 0 ? undefined : '3 4'}
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

			{#each ticks as index (index)}
				<text
					x={center(index)}
					y={height - 8}
					text-anchor="middle"
					class="fill-muted-foreground text-[11px]"
				>
					{points[index].label}
				</text>
			{/each}

			{#each points as point, index (index)}
				<path
					d={bar(index, point.value)}
					class="transition-opacity duration-150 {point.value > 0
						? 'fill-primary'
						: 'fill-foreground/12'} {hover !== null && hover !== index ? 'opacity-45' : ''}"
				/>
			{/each}

			<!-- Прозора зона: ловить рух і між стовпчиками. -->
			<rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} fill="transparent" />
		</svg>

		{#if active}
			<div
				class="pointer-events-none absolute z-10 min-w-36 rounded-[10px] border border-border bg-popover px-3 py-2 shadow-lg"
				style:left="{active.x}px"
				style:top="{Math.max(0, active.y - 8)}px"
				style:transform={tipLeft
					? 'translate(calc(-100% - 14px), -100%)'
					: 'translate(14px, -100%)'}
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
