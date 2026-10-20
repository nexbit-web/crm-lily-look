<script lang="ts">
	import Deferred from '$lib/components/deferred.svelte';
	import RouteSkeleton from '$lib/components/skeletons/route-skeleton.svelte';
	import { viewOf, type Loaded } from '$lib/stream';
	import AdminsView from './admins-view.svelte';
	import type { PageProps } from './$types';

	/** Перше відкриття — скелетон, поки дані йдуть стрімом; далі — одразу. */
	let { data }: PageProps = $props();
</script>

<Deferred value={viewOf<Loaded<typeof data>>(data)}>
	{#snippet skeleton()}
		<RouteSkeleton path="/admins" />
	{/snippet}
	{#snippet children(view)}
		<AdminsView data={view} />
	{/snippet}
</Deferred>
