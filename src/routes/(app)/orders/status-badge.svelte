<script lang="ts">
	import { STATUS_LABELS, STATUS_PILLS, type OrderStatusKey } from '$lib/orders';
	import { STATUS_ICONS } from './order-icons';

	/** Плашка статусу, як у ClickUp: суцільна заливка, значок і назва великими. */
	let { status }: { status: OrderStatusKey } = $props();

	const Icon = $derived(STATUS_ICONS[status]);
</script>

<span
	class="inline-flex h-5.5 items-center gap-1 rounded-[6px] px-2 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase {STATUS_PILLS[
		status
	]}"
>
	<Icon size={12} strokeWidth={2.5} />
	{STATUS_LABELS[status]}
</span>
