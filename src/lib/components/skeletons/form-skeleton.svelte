<script lang="ts">
	/**
	 * Скелетон картки товару: шапка з хлібними крихтами й кнопкою, ліворуч
	 * блоки полів, праворуч — видимість і фото.
	 */
	const card = 'rounded-[12px] border border-border bg-card p-4';
	const field = 'space-y-2';
</script>

<div aria-busy="true" aria-label="Завантаження">
	<div
		class="sticky -top-2 z-30 -mt-2 -mr-2 mb-3 -ml-3 flex h-12 items-center gap-2 border-b border-border bg-panel pr-2 pl-3"
	>
		<span class="size-7 skeleton rounded-full"></span>
		<div class="space-y-1.5">
			<span class="block h-3 w-44 skeleton rounded-full"></span>
			<span class="block h-2.5 w-28 skeleton rounded-full"></span>
		</div>
		<span class="ml-auto h-7 w-24 skeleton rounded-[6px]"></span>
	</div>

	<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
		<div class="space-y-3">
			{#each [4, 3, 2] as fields, block (block)}
				<section class={card}>
					<span class="block h-3.5 w-32 skeleton rounded-full"></span>
					<div class="mt-4 grid gap-4 sm:grid-cols-2">
						{#each Array.from({ length: fields }, (_, index) => index) as index (index)}
							<div class="{field} {index === 0 && block === 0 ? 'sm:col-span-2' : ''}">
								<span class="block h-2.5 w-20 skeleton rounded-full"></span>
								<span class="block h-8 skeleton rounded-[8px]"></span>
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>

		<div class="space-y-3">
			<section class="{card} flex items-center gap-3">
				<span class="h-3.5 flex-1 skeleton rounded-full"></span>
				<span class="h-6 w-10 skeleton rounded-full"></span>
			</section>
			<section class={card}>
				<span class="block h-3.5 w-20 skeleton rounded-full"></span>
				<div class="mt-4 grid grid-cols-3 gap-2">
					{#each Array.from({ length: 6 }, (_, index) => index) as index (index)}
						<span class="aspect-square skeleton rounded-[10px]"></span>
					{/each}
				</div>
			</section>
		</div>
	</div>
</div>
