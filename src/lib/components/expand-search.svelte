<script lang="ts">
	import { Search, X } from '@lucide/svelte';

	/**
	 * Пошук у панелі, як у ClickUp: спершу квадратик 24×24 з лупою, по кліку
	 * поле виїжджає вліво; втратило фокус — згортається назад. Якщо пошук уже
	 * застосований (`applied`), поле лишається відкритим, щоб було видно, що
	 * список відфільтровано.
	 */
	let {
		value = $bindable(''),
		applied = '',
		placeholder = 'Пошук…',
		label,
		onsearch
	}: {
		value?: string;
		applied?: string;
		placeholder?: string;
		/** Що шукаємо — для екранних читалок. */
		label: string;
		/** Застосувати запит; порожній рядок — скинути. */
		onsearch: (query: string) => void;
	} = $props();

	let input = $state<HTMLInputElement | null>(null);
	let focused = $state(false);
	const expanded = $derived(focused || applied !== '');
</script>

<form
	class="flex h-6 items-center overflow-hidden rounded-[6px] border transition-[width,border-color] duration-200 ease-out {expanded
		? 'w-56 border-primary'
		: 'w-6 border-border hover:bg-foreground/4'}"
	onsubmit={(event) => {
		event.preventDefault();
		onsearch(value);
	}}
	onfocusout={(event) => {
		const next = event.relatedTarget as Node | null;
		if (!next || !event.currentTarget.contains(next)) focused = false;
	}}
>
	<button
		type="button"
		aria-label={label}
		class="flex size-5.5 shrink-0 items-center justify-center text-muted-foreground {expanded
			? 'cursor-default'
			: 'hover:text-foreground'}"
		onclick={() => {
			focused = true;
			input?.focus();
		}}
	>
		<Search size={14} />
	</button>
	<input
		bind:this={input}
		bind:value
		tabindex={expanded ? 0 : -1}
		{placeholder}
		aria-label={label}
		class="h-full min-w-0 flex-1 bg-transparent pr-2 text-[13px] outline-none placeholder:text-muted-foreground"
		onfocus={() => (focused = true)}
		onkeydown={(event) => {
			if (event.key === 'Escape') input?.blur();
		}}
	/>
	{#if applied && expanded}
		<button
			type="button"
			aria-label="Очистити пошук"
			class="mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground hover:bg-foreground/8"
			onclick={() => {
				value = '';
				onsearch('');
			}}
		>
			<X size={13} />
		</button>
	{/if}
</form>
