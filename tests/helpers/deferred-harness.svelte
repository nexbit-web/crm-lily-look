<script lang="ts">
	import Deferred from '$lib/components/deferred.svelte';

	/** Обгортка для тесту: Deferred приймає сніпети, а їх зручно задати лише в .svelte. */
	let { value }: { value: unknown } = $props();
</script>

<Deferred {value}>
	{#snippet skeleton()}<p>скелетон</p>{/snippet}
	{#snippet children(data)}<p>дані: {JSON.stringify(data)}</p>{/snippet}
</Deferred>
