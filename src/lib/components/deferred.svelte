<script lang="ts" generics="T">
	import { untrack, type Snippet } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { RotateCcw } from '@lucide/svelte';
	import { streaming } from '$lib/loading.svelte';

	/**
	 * Показує дані, щойно вони є. Проміс (перше відкриття сторінки) — поки він
	 * летить, малюємо скелетон; готові дані (переходи, «Зберегти») — одразу,
	 * без жодного мигання.
	 */
	let {
		value,
		skeleton,
		children
	}: { value: T | Promise<T>; skeleton: Snippet; children: Snippet<[T]> } = $props();

	const isPromise = (input: unknown): input is Promise<T> =>
		typeof (input as Promise<T> | null)?.then === 'function';

	const pending = $derived(isPromise(value) ? value : null);

	/** Чим закінчився саме цей проміс: старий результат новому не заважає. */
	let settled = $state<{ source: Promise<T>; value?: T; failed?: boolean } | null>(null);

	$effect(() => {
		const source = pending;
		if (!source) return;
		let live = true;
		// Поки проміс летить, шапка знає, що сторінка ще вантажиться.
		let counted = true;
		// untrack: лічильник лише пишемо — від нього ефект залежати не повинен.
		untrack(() => (streaming.pending += 1));
		const done = () => {
			if (counted) untrack(() => (streaming.pending -= 1));
			counted = false;
		};
		source.then(
			(result) => {
				if (live) settled = { source, value: result };
				done();
			},
			() => {
				if (live) settled = { source, failed: true };
				done();
			}
		);
		return () => {
			live = false;
			done();
		};
	});

	const current: { value?: T; failed?: boolean } | null = $derived(
		pending ? (settled?.source === pending ? settled : null) : { value: value as T }
	);
</script>

{#if current?.failed}
	<div
		class="flex flex-col items-center gap-3 rounded-[12px] border border-border px-6 py-14 text-center"
	>
		<p class="text-[13px] text-muted-foreground">Не вдалося завантажити дані.</p>
		<button
			type="button"
			class="flex h-7 items-center gap-1.5 rounded-[6px] border border-border px-2.5 text-[12px] font-medium transition-colors hover:bg-foreground/5"
			onclick={() => invalidateAll()}
		>
			<RotateCcw size={13} />
			Спробувати ще раз
		</button>
	</div>
{:else if current}
	{@render children(current.value as T)}
{:else}
	{@render skeleton()}
{/if}
