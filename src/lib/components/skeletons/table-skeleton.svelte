<script lang="ts" module>
	export type CellKind = 'num' | 'text' | 'wide' | 'image' | 'avatar' | 'badge' | 'short';
</script>

<script lang="ts">
	import { cell, headRow, table } from '$lib/table';

	/**
	 * Скелетон сторінки-таблиці (замовлення, товари, категорії…): заголовок,
	 * пілюлі фільтрів і таблиця в тій самій сітці, що й справжня, — тож коли
	 * дані приходять, нічого не стрибає.
	 */
	let {
		columns,
		cells,
		rows = 12,
		pills = 3,
		tabs = 0
	}: {
		/** Той самий grid-cols-[…], що й у справжньої таблиці. */
		columns: string;
		/** Що в кожній колонці: від цього залежить форма плашки. */
		cells: CellKind[];
		rows?: number;
		pills?: number;
		/** Смуга вкладок замість пілюль (відвідуваність, бот). */
		tabs?: number;
	} = $props();

	/** Довжина плашки в рядку — трохи різна, щоб не виглядало як штрих-код. */
	const LENGTHS = [72, 54, 86, 62, 78, 48, 66, 90, 58, 70, 82, 52];
	const width = (row: number, column: number) => LENGTHS[(row * 3 + column * 5) % LENGTHS.length];
</script>

<div class="flex flex-col gap-2 pb-6" aria-busy="true" aria-label="Завантаження">
	<div class="flex h-8 items-center gap-2">
		<span class="h-4.5 w-32 skeleton rounded-[6px]"></span>
		<span class="h-4.5 w-6 skeleton rounded-[6px]"></span>
	</div>

	{#if tabs > 0}
		<div class="-mr-2 -ml-3 flex h-10 items-center gap-4 border-b border-border pr-2 pl-3.5">
			{#each Array.from({ length: tabs }, (_, index) => index) as index (index)}
				<span class="h-3.5 skeleton rounded-[5px]" style:width="{64 + (index % 3) * 14}px"></span>
			{/each}
			<span class="ml-auto h-6 w-24 skeleton rounded-[6px]"></span>
		</div>
	{:else}
		<div class="flex items-center gap-1.5">
			{#each Array.from({ length: pills }, (_, index) => index) as index (index)}
				<span class="h-6 skeleton rounded-full" style:width="{68 + (index % 3) * 16}px"></span>
			{/each}
			<span class="ml-auto h-6 w-24 skeleton rounded-[6px]"></span>
		</div>
	{/if}

	<div class="-mr-2 -ml-3 overflow-hidden">
		<div class={table}>
			<div class="{headRow} {columns}">
				{#each cells as kind, column (column)}
					<span class="{cell} {kind === 'num' ? 'justify-center' : ''}">
						<span class="h-2.5 skeleton rounded-full {kind === 'num' ? 'w-2.5' : 'w-14'}"></span>
					</span>
				{/each}
			</div>

			{#each Array.from({ length: rows }, (_, index) => index) as row (row)}
				<!-- Нижні рядки блякнуть: видно, що це лише заглушка, а не порожня таблиця. -->
				<div
					class="grid h-9 border-b border-border {columns}"
					style:opacity={Math.max(0.25, 1 - row * 0.06)}
				>
					{#each cells as kind, column (column)}
						<span class="{cell} gap-2 {kind === 'num' ? 'justify-center' : ''}">
							{#if kind === 'num'}
								<span class="size-3 skeleton rounded-[4px]"></span>
							{:else if kind === 'image' || kind === 'avatar'}
								<span
									class="size-6 shrink-0 skeleton {kind === 'avatar'
										? 'rounded-full'
										: 'rounded-[6px]'}"
								></span>
								<span class="h-3 skeleton rounded-full" style:width="{width(row, column)}%"></span>
							{:else if kind === 'badge'}
								<span class="h-5.5 w-20 skeleton rounded-[6px]"></span>
							{:else if kind === 'short'}
								<span class="h-3 w-10 skeleton rounded-full"></span>
							{:else}
								<span
									class="h-3 skeleton rounded-full"
									style:width="{kind === 'wide' ? width(row, column) : width(row, column) * 0.7}%"
								></span>
							{/if}
						</span>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>
