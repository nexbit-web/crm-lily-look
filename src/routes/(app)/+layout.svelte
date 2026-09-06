<script lang="ts">
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<!-- Хедера немає — вихід і перемикач теми живуть у /settings. -->
<div class="flex h-svh gap-2 p-2">
	<Sidebar user={{ role: data.user.role ?? 'OPERATOR' }} newOrders={data.newOrders} />

	<div
		class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
	>
		<main class="min-h-0 flex-1 overflow-auto p-6">
			{@render children()}
		</main>
	</div>
</div>
