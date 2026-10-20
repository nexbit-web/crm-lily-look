<script lang="ts">
	import Deferred from '$lib/components/deferred.svelte';
	import RouteSkeleton from '$lib/components/skeletons/route-skeleton.svelte';
	import { viewOf, type Loaded } from '$lib/stream';
	import StatisticsView from './statistics-view.svelte';
	import type { PageProps } from './$types';

	/** Перше відкриття — скелетон, поки дані йдуть стрімом; далі — одразу. */
	let { data }: PageProps = $props();
</script>

<Deferred value={viewOf<Loaded<typeof data>>(data)}>
	{#snippet skeleton()}
		<RouteSkeleton path="/statistics" />
	{/snippet}
	{#snippet children(view)}
		<StatisticsView data={view} />
	{/snippet}
</Deferred>
