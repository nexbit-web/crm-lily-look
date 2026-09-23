<script lang="ts" generics="T extends string">
	/**
	 * Сегментований перемикач, як у «Системних параметрах»: усі варіанти видно
	 * одразу, вибраний — піднятий над доріжкою.
	 *
	 * Піднятий сегмент фарбуємо в --surface, а не в --background: у темній темі
	 * тло сторінки чорне, і всередині сірого діалога такий сегмент виглядав
	 * дірою.
	 */
	let {
		value,
		options,
		onselect
	}: {
		value: T;
		options: readonly { value: T; label: string }[];
		onselect: (value: T) => void;
	} = $props();
</script>

<div class="flex gap-1 rounded-[12px] bg-foreground/6 p-1">
	{#each options as option (option.value)}
		<button
			type="button"
			class="flex-1 rounded-[9px] px-2 py-1.5 text-[13px] font-medium transition-colors {value ===
			option.value
				? 'bg-surface text-foreground shadow-sm'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => onselect(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>
