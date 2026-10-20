<script lang="ts" module>
	import { cloudinaryPreview } from '$lib/cloudinary-url';

	/**
	 * Уже замовлені великі версії фото. Обʼєкти Image тримаємо, щоб браузер не
	 * скасував завантаження, а повторно те саме фото не тягнув.
	 */
	// Кеш завантажень, а не стан: інтерфейс його не читає, реактивність ні до чого.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const warmed = new Map<string, HTMLImageElement>();

	/**
	 * Заздалегідь тягне версію для перегляду. Cloudinary генерує кожен розмір
	 * при першому запиті, і це помітна пауза — краще перечекати її, поки
	 * курсор лише наближається до фото.
	 */
	export function warmPreview(url: string): void {
		const src = cloudinaryPreview(url);
		if (warmed.has(src) || typeof Image === 'undefined') return;
		const image = new Image();
		image.decoding = 'async';
		image.src = src;
		warmed.set(src, image);
	}
</script>

<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { ChevronLeft, ChevronRight, X } from '@lucide/svelte';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	/**
	 * Перегляд фото на весь екран.
	 *
	 * Зібраний на примітивах bits-ui, а не на нашому Dialog.Content: тому
	 * потрібні картка з рамкою й світла підкладка, а тут — темний фон на весь
	 * екран. Фокус, Escape і блокування прокрутки лишаються від примітива.
	 */
	let {
		urls,
		index = $bindable(null),
		alt = 'Фото товару'
	}: {
		urls: string[];
		/** Індекс відкритого фото; null — перегляд закритий. */
		index: number | null;
		alt?: string;
	} = $props();

	const current = $derived(index === null ? null : (urls[index] ?? null));
	/** Чи вже домалювалось поточне фото; поки ні — крутиться індикатор. */
	let loaded = $state(false);

	// Щойно перегляд відкрито — тягнемо всі фото товару одразу: гортання
	// далі миттєве, без паузи на кожному кроці.
	const isOpen = $derived(index !== null);
	$effect(() => {
		if (isOpen) for (const url of urls) warmPreview(url);
	});

	function close() {
		index = null;
	}

	/** Гортання по колу: з останнього фото вперед — знову на перше. */
	function step(delta: number) {
		if (index === null || urls.length < 2) return;
		index = (index + delta + urls.length) % urls.length;
	}
</script>

<DialogPrimitive.Root
	open={current !== null}
	onOpenChange={(value) => {
		if (!value) close();
	}}
>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-black/85 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
		/>

		<DialogPrimitive.Content
			class="fixed inset-0 z-50 flex items-center justify-center p-4 duration-150 outline-none sm:p-10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
			onkeydown={(event) => {
				if (event.key === 'ArrowLeft') step(-1);
				if (event.key === 'ArrowRight') step(1);
			}}
			onclick={close}
		>
			<!-- Заголовок потрібен зчитувачам екрана; на вигляд тут лише фото. -->
			<DialogPrimitive.Title class="sr-only">{alt}</DialogPrimitive.Title>

			{#if current}
				<!-- Нове фото — новий <img>: старе не висить на екрані, поки
				     лічильник уже показує наступне. -->
				{#key current}
					<img
						src={cloudinaryPreview(current)}
						{alt}
						class="max-h-full max-w-full rounded-lg object-contain shadow-2xl transition-opacity duration-150 {loaded
							? 'opacity-100'
							: 'opacity-0'}"
						onload={() => (loaded = true)}
						onerror={() => (loaded = true)}
						{@attach (image: HTMLImageElement) => {
							// Із кешу фото готове ще до onload — не блимаємо індикатором.
							loaded = image.complete && image.naturalWidth > 0;
						}}
					/>
				{/key}
				{#if !loaded}
					<Spinner class="pointer-events-none absolute size-6 text-white/70" />
				{/if}
			{/if}

			<!-- Кнопки не мають закривати перегляд разом із кліком по тлу. -->
			<button
				type="button"
				aria-label="Закрити"
				class="absolute top-4 right-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:top-6 sm:right-6"
				onclick={(event) => {
					event.stopPropagation();
					close();
				}}
			>
				<X size={18} />
			</button>

			{#if urls.length > 1 && index !== null}
				<button
					type="button"
					aria-label="Попереднє фото"
					class="absolute top-1/2 left-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
					onclick={(event) => {
						event.stopPropagation();
						step(-1);
					}}
				>
					<ChevronLeft size={20} />
				</button>
				<button
					type="button"
					aria-label="Наступне фото"
					class="absolute top-1/2 right-3 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
					onclick={(event) => {
						event.stopPropagation();
						step(1);
					}}
				>
					<ChevronRight size={20} />
				</button>

				<p class="absolute bottom-5 text-xs text-white/60 tabular-nums">
					{index + 1} / {urls.length}
				</p>
			{/if}
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
