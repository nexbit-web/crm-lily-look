<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';

	/**
	 * Панель угорі сторінки товару, як у ClickUp: «назад», хлібні крихти
	 * «Товари / назва», праворуч — дії. Приклеєна до верху й напівпрозора:
	 * назва й «Зберегти» лишаються під рукою, скільки б не було розмірів.
	 *
	 * Відʼємні відступи компенсують поля сторінки (8 px згори й справа, 12 px
	 * зліва): панель лягає від краю до краю, і під нею не прозирає смужка.
	 */
	let { title, subtitle, actions }: { title: string; subtitle?: string; actions: Snippet } =
		$props();
</script>

<div
	class="sticky -top-2 z-30 -mt-2 -mr-2 mb-3 -ml-3 border-b border-border bg-panel/90 py-2 pr-2 pl-3 backdrop-blur-xl dark:bg-panel"
>
	<div class="flex h-8 items-center gap-2">
		<a
			href="/products"
			class="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
			aria-label="Назад до списку"
		>
			<ChevronLeft size={17} />
		</a>

		<div class="min-w-0 flex-1">
			<p class="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight">
				<a href="/products" class="shrink-0 text-muted-foreground hover:text-foreground">Товари</a>
				<span class="text-muted-foreground/50">/</span>
				<span class="truncate font-semibold">{title}</span>
			</p>
			{#if subtitle}
				<p class="truncate text-[11px] leading-tight text-muted-foreground">{subtitle}</p>
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-1.5">
			{@render actions()}
		</div>
	</div>
</div>
