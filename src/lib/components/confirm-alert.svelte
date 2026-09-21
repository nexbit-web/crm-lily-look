<script module lang="ts">
	/**
	 * Класи кнопки підтвердження — вона лишається на сторінці, бо там і форма
	 * з дією, і обробка результату. Кольори два: червона для видалення й синя
	 * для всього іншого.
	 */
	export function alertActionClass(tone: 'danger' | 'primary' = 'danger'): string {
		const fill =
			tone === 'danger'
				? 'bg-destructive hover:bg-destructive/90'
				: 'bg-primary hover:bg-primary/90';

		return `flex h-12 w-full items-center justify-center gap-2 rounded-[14px] ${fill} text-[15px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60`;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	/**
	 * Підтвердження в стилі системного алерта Apple: вузька картка, заголовок
	 * із поясненням і дві кнопки на всю ширину одна під одною.
	 *
	 * Дію передає сторінка (зазвичай це form з use:enhance) — компонент відповідає
	 * лише за вигляд. Класи для її кнопки бере з alertActionClass().
	 */
	let {
		open = $bindable(false),
		title,
		description,
		cancelLabel = 'Скасувати',
		action
	}: {
		open: boolean;
		title: string;
		description?: string;
		cancelLabel?: string;
		/** Кнопка підтвердження разом із формою. */
		action: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open>
	<!-- Хрестика немає навмисно: в алерта рівно два виходи, обидва кнопками. -->
	<Dialog.Content
		showCloseButton={false}
		class="w-[19rem] max-w-[calc(100%-3rem)] gap-0 rounded-[22px] p-0 sm:max-w-[19rem]"
	>
		<div class="space-y-1.5 px-5 pt-5 pb-4">
			<Dialog.Title class="text-[17px] leading-snug font-semibold">{title}</Dialog.Title>
			{#if description}
				<Dialog.Description class="text-[13.5px] leading-[1.4] text-foreground/70">
					{description}
				</Dialog.Description>
			{/if}
		</div>

		<div class="space-y-2 px-4 pb-4">
			{@render action()}
			<button
				type="button"
				class="h-12 w-full rounded-[14px] bg-foreground/8 text-[15px] font-medium transition-colors hover:bg-foreground/12"
				onclick={() => (open = false)}
			>
				{cancelLabel}
			</button>
		</div>
	</Dialog.Content>
</Dialog.Root>
