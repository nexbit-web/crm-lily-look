<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check, ChevronDown } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input/index.js';

	export type SuggestOption = { value: string; hex?: string | null };

	/**
	 * Поле з підказками: звичайний текстовий input, під яким за кліком
	 * розкривається весь список уже відомих значень.
	 *
	 * Чому не Select: розмір «S/M» чи колір «Мокко» менеджер має право вписати
	 * від руки, навіть якщо в базі їх ще немає. Тому значення лишається вільним
	 * текстом, а меню — лише швидкий спосіб не друкувати те, що вже є.
	 */
	let {
		value = $bindable(''),
		options,
		label,
		placeholder,
		inputClass = '',
		menuClass = '',
		leading,
		oncommit
	}: {
		value: string;
		options: SuggestOption[];
		/** Підпис для кнопки-стрілки: поле саме по собі підпису не має. */
		label: string;
		placeholder?: string;
		inputClass?: string;
		menuClass?: string;
		/** Вміст усередині поля зліва — наприклад, крапля кольору. */
		leading?: Snippet;
		/** Значення змінили: вручну або вибором зі списку. */
		oncommit?: () => void;
	} = $props();

	let open = $state(false);
	/** Пункт під стрілками клавіатури; -1 — жодного. */
	let active = $state(-1);
	let field = $state<HTMLInputElement | null>(null);
	let wrapper = $state<HTMLDivElement | null>(null);
	let list = $state<HTMLDivElement | null>(null);
	let menuStyle = $state('');

	/** Шість рядків по 32 px плюс поля контейнера. */
	const MENU_MAX = 200;

	/**
	 * Меню позиціонуємо вручну, бо воно `fixed`.
	 *
	 * Абсолютний блок усередині картки збільшував би прокрутку сторінки — варто
	 * було відкрити список у нижньому рядку розмірів, і збоку зʼявлявся скрол.
	 * `fixed` у площу прокрутки не входить, але й за полем сам не йде, тому
	 * координати рахуємо тут і оновлюємо на скрол та зміну розміру вікна.
	 */
	function place() {
		const box = wrapper?.getBoundingClientRect();
		if (!box) return;

		const below = window.innerHeight - box.bottom;
		const side =
			below < MENU_MAX + 12 && box.top > below
				? `bottom:${window.innerHeight - box.top + 4}px`
				: `top:${box.bottom + 4}px`;

		menuStyle = `left:${box.left}px; width:${box.width}px; ${side};`;
	}

	const selected = $derived(
		options.findIndex((option) => option.value.toLowerCase() === value.trim().toLowerCase())
	);

	function show() {
		if (open || options.length === 0) return;
		active = selected;
		place();
		open = true;
	}

	function pick(option: SuggestOption) {
		value = option.value;
		open = false;
		oncommit?.();
		field?.focus();
	}

	// Підсвічений пункт мусить лишатись на видноті: список зі скролом, і
	// стрілками з нього легко «піти» за край.
	$effect(() => {
		if (!open || active < 0) return;
		list?.children[active]?.scrollIntoView({ block: 'nearest' });
	});

	// Клік повз поле закриває меню. Слухаємо pointerdown, а не click: вибір
	// пункту теж відбувається на pointerdown, і порядок має бути саме такий.
	$effect(() => {
		if (!open) return;

		const close = (event: PointerEvent) => {
			if (!wrapper?.contains(event.target as Node)) open = false;
		};
		// capture: сторінка прокручується не у вікні, а у внутрішньому контейнері,
		// і його події до window інакше не доходять.
		window.addEventListener('pointerdown', close);
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);

		return () => {
			window.removeEventListener('pointerdown', close);
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			open = false;
			event.preventDefault();
			return;
		}

		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			if (!open) {
				show();
				return;
			}
			const step = event.key === 'ArrowDown' ? 1 : -1;
			active =
				active < 0
					? step === 1
						? 0
						: options.length - 1
					: (active + step + options.length) % options.length;
			return;
		}

		// Enter у відкритому меню вибирає пункт і ніколи не відправляє форму.
		if (event.key === 'Enter' && open) {
			event.preventDefault();
			if (active >= 0) pick(options[active]);
			else open = false;
		}
	}
</script>

<div class="relative" bind:this={wrapper}>
	{@render leading?.()}

	<Input
		bind:ref={field}
		bind:value
		{placeholder}
		class="h-10 pr-8 {inputClass}"
		autocomplete="off"
		role="combobox"
		aria-expanded={open}
		aria-autocomplete="list"
		onfocus={show}
		onpointerdown={show}
		onchange={() => oncommit?.()}
		{onkeydown}
	/>

	{#if options.length > 0}
		<!-- tabindex=-1 і preventDefault: стрілка лише перемикає меню, фокус має
		     лишатись у полі, інакше воно закривалось би від власної кнопки. -->
		<button
			type="button"
			tabindex={-1}
			aria-label={label}
			class="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
			onpointerdown={(event) => {
				event.preventDefault();
				if (open) open = false;
				else {
					show();
					field?.focus();
				}
			}}
		>
			<ChevronDown size={14} class="transition-transform {open ? 'rotate-180' : ''}" />
		</button>
	{/if}

	{#if open}
		<!-- max-h — рівно шість рядків по 32 px плюс поля контейнера: далі скрол,
		     щоб меню не займало пів екрана, коли значень багато. -->
		<div
			bind:this={list}
			role="listbox"
			aria-label={label}
			style={menuStyle}
			class="fixed z-50 max-h-50 overflow-y-auto rounded-xl bg-popover p-1 shadow-lg ring-1 ring-foreground/10 {menuClass}"
		>
			{#each options as option, index (option.value)}
				<button
					type="button"
					role="option"
					aria-selected={index === selected}
					class="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors {index ===
					active
						? 'bg-accent text-accent-foreground'
						: ''}"
					onpointerdown={(event) => {
						event.preventDefault();
						pick(option);
					}}
					onpointerenter={() => (active = index)}
				>
					{#if option.hex !== undefined}
						<span
							class="size-3 shrink-0 rounded-full border border-foreground/10"
							style="background: {option.hex ?? 'transparent'}"
						></span>
					{/if}
					<span class="truncate">{option.value}</span>
					{#if index === selected}
						<Check size={15} strokeWidth={2.5} class="ml-auto shrink-0 text-primary" />
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
