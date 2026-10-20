<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	/**
	 * Рядок блоку картки: значок, підпис ліворуч, значення праворуч. Замість
	 * звичайного значка можна передати свій (`lead`) — наприклад, логотип
	 * перевізника.
	 */
	let {
		icon: Icon,
		lead,
		label,
		children
	}: { icon?: Component; lead?: Snippet; label: string; children: Snippet } = $props();
</script>

<div class="flex items-center gap-2.5 px-3 py-2 text-[13px]">
	<span class="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
		{#if lead}
			{@render lead()}
		{:else if Icon}
			<Icon size={15} />
		{/if}
	</span>
	<span class="w-16 shrink-0 text-muted-foreground">{label}</span>
	<div class="min-w-0 flex-1 truncate text-right">{@render children()}</div>
</div>
