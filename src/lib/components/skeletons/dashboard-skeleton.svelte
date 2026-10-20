<script lang="ts">
	/**
	 * Скелетон статистики й відвідуваності: заголовок із перемикачем періоду,
	 * головна картка з показниками й графіком, під нею дві картки-списки.
	 */
	let { tiles = 4, tabs = 0 }: { tiles?: number; tabs?: number } = $props();

	/** Висоти стовпчиків-заглушок графіка — «хвиля», а не рівний паркан. */
	const BARS = [38, 52, 44, 63, 58, 71, 49, 66, 80, 62, 74, 55, 68, 86, 72, 60, 78, 64, 88, 70];
	const card = 'overflow-hidden rounded-[12px] border border-border bg-card';
</script>

<div class="flex flex-col gap-3 pb-6" aria-busy="true" aria-label="Завантаження">
	<div class="flex h-8 items-center gap-2">
		<span class="h-4.5 w-36 skeleton rounded-[6px]"></span>
		<span class="ml-auto h-7 w-72 skeleton rounded-[8px]"></span>
	</div>

	{#if tabs > 0}
		<div class="-mr-2 -ml-3 flex h-10 items-center gap-4 border-b border-border pr-2 pl-3.5">
			{#each Array.from({ length: tabs }, (_, index) => index) as index (index)}
				<span class="h-3.5 skeleton rounded-[5px]" style:width="{56 + (index % 3) * 16}px"></span>
			{/each}
		</div>
	{/if}

	<section class={card}>
		<div
			class="grid gap-px border-b border-border bg-border"
			style:grid-template-columns="repeat({tiles}, minmax(0, 1fr))"
		>
			{#each Array.from({ length: tiles }, (_, index) => index) as index (index)}
				<div class="flex flex-col gap-2.5 bg-card px-4 py-4">
					<span class="h-3 w-20 skeleton rounded-full"></span>
					<span class="h-6 skeleton rounded-[6px]" style:width="{56 + (index % 3) * 12}%"></span>
				</div>
			{/each}
		</div>
		<div class="px-4 pt-4 pb-3">
			<span class="block h-3.5 w-40 skeleton rounded-full"></span>
			<div class="mt-5 flex h-52 items-end gap-2 pl-11">
				{#each BARS as height, index (index)}
					<span class="flex-1 skeleton rounded-t-[4px]" style:height="{height}%"></span>
				{/each}
			</div>
		</div>
	</section>

	<div class="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
		{#each [6, 5] as rows, column (column)}
			<section class={card}>
				<header class="flex h-11 items-center border-b border-border px-4">
					<span class="h-3.5 w-28 skeleton rounded-full"></span>
				</header>
				<div class="space-y-4 p-4">
					{#each Array.from({ length: rows }, (_, index) => index) as row (row)}
						<div class="flex items-center gap-3" style:opacity={1 - row * 0.1}>
							<span class="size-3 skeleton rounded-[4px]"></span>
							<span class="h-3 flex-1 skeleton rounded-full"></span>
							<span class="h-3 w-16 skeleton rounded-full"></span>
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</div>
</div>
