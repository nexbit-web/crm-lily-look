<script lang="ts">
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<!-- Хедера немає — вихід і перемикач теми живуть у /settings. -->
<div class="flex h-svh gap-1  p-1 ">
	<Sidebar user={{ role: data.user.role ?? 'OPERATOR' }} newOrders={data.newOrders} />

	<div
		class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
	>
		<!-- Одна ширина на всю CRM: 1010 px — далі сторінка не розтягується,
		     нижче просто стискається. Сторінки свою ширину більше не задають. -->
		<main class="min-h-0 flex-1 overflow-auto p-6">
			<div class="mx-auto w-full max-w-252.5">
				{@render children()}
			</div>
		</main>
	</div>
</div>
