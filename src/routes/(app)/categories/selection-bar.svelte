<script lang="ts">
	import { fly } from 'svelte/transition';
	import { ArrowRightLeft, Trash2, X } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { ROOT } from './category-dialog.svelte';

	/**
	 * Панель масових дій, як у ClickUp: темна смуга внизу по центру панелі,
	 * ліворуч — скільки вибрано (× знімає вибір), праворуч — дії. Видалення
	 * питає підтвердження просто в смузі.
	 */
	let {
		count,
		busy = false,
		moveTargets,
		pathOf,
		onclear,
		onmove,
		ondelete
	}: {
		count: number;
		busy?: boolean;
		/** Куди можна перенести: без самих вибраних і їхніх нащадків. */
		moveTargets: { id: string }[];
		pathOf: (id: string) => string;
		onclear: () => void;
		onmove: (parentId: string) => void;
		ondelete: () => void;
	} = $props();

	let confirming = $state(false);

	// Змінився вибір — підтвердження видалення знімаємо.
	$effect(() => {
		void count;
		confirming = false;
	});

	/** «1 категорія», «3 категорії», «5 категорій». */
	function categories(n: number): string {
		const mod10 = n % 10;
		const mod100 = n % 100;
		if (mod10 === 1 && mod100 !== 11) return `${n} категорію`;
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} категорії`;
		return `${n} категорій`;
	}

	/** Кнопка смуги без кольору тексту — його задає вид нижче. */
	const base =
		'flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40';
	const action = `${base} text-white/85 hover:bg-white/10 hover:text-white`;
	/** «Видалити» — червоне одразу, і текст, і значок: видно, що це назавжди. */
	const danger = `${base} text-[#ff5c5c] hover:bg-[#e5484d]/15 hover:text-[#ff7a7a]`;
</script>

<div
	transition:fly={{ y: 24, duration: 180 }}
	class="fixed bottom-6 left-[calc(50vw+29px)] z-90 flex max-w-[calc(100vw-96px)] -translate-x-1/2 items-center gap-1 rounded-[12px] border border-white/10 bg-[#1f1f1f] p-1.5 text-white shadow-[0_12px_32px_-8px_rgba(0,0,0,0.5)] dark:bg-[#2a2a2a]"
	role="toolbar"
	aria-label="Дії з вибраними категоріями"
>
	<span
		class="flex h-8 shrink-0 items-center gap-2 rounded-[8px] border border-white/15 pr-1 pl-3 text-[13px] font-semibold whitespace-nowrap"
	>
		Вибрано: {count}
		<button
			type="button"
			aria-label="Зняти вибір"
			title="Зняти вибір (Esc)"
			class="flex size-6 items-center justify-center rounded-[6px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
			onclick={onclear}
		>
			<X size={14} />
		</button>
	</span>

	{#if confirming}
		<span class="px-2 text-[13px] whitespace-nowrap text-white/80">
			Видалити {categories(count)} назавжди?
		</span>
		<button
			type="button"
			class="flex h-8 items-center gap-1.5 rounded-[8px] bg-[#e5484d] px-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
			disabled={busy}
			onclick={ondelete}
		>
			{#if busy}<Spinner class="size-3.5" />{/if}
			Так, видалити
		</button>
		<button type="button" class={action} onclick={() => (confirming = false)}>Ні</button>
	{:else}
		<span class="mx-1 h-5 w-px shrink-0 bg-white/15" aria-hidden="true"></span>

		<DropdownMenu.Root>
			<DropdownMenu.Trigger disabled={busy}>
				{#snippet child({ props })}
					<button {...props} type="button" class={action}>
						<ArrowRightLeft size={15} />
						Перенести
					</button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				side="top"
				align="center"
				sideOffset={14}
				class="z-100 max-h-72 w-64 rounded-[12px] p-1"
			>
				<DropdownMenu.Label class="px-2 text-[11px] font-medium text-muted-foreground">
					Перенести в…
				</DropdownMenu.Label>
				<DropdownMenu.Item class="h-7.5 rounded-[7px] text-[13px]" onclick={() => onmove(ROOT)}>
					Верхній рівень
				</DropdownMenu.Item>
				{#each moveTargets as target (target.id)}
					<DropdownMenu.Item
						class="h-7.5 rounded-[7px] text-[13px]"
						onclick={() => onmove(target.id)}
					>
						<span class="truncate">{pathOf(target.id)}</span>
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<span class="mx-1 h-5 w-px shrink-0 bg-white/15" aria-hidden="true"></span>

		<button type="button" class={danger} disabled={busy} onclick={() => (confirming = true)}>
			{#if busy}<Spinner class="size-3.5" />{:else}<Trash2 size={15} />{/if}
			Видалити
		</button>
	{/if}
</div>
