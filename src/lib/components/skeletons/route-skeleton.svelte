<script lang="ts" module>
	import type { CellKind } from './table-skeleton.svelte';

	/** Чи є для адреси свій скелетон (налаштуванням він не потрібен — даних там нема). */
	export function hasSkeleton(path: string): boolean {
		return /^\/(orders|products|categories|discounts|statistics|traffic|admins|telegram)(\/|$)/.test(
			path
		);
	}

	type Table = { columns: string; cells: CellKind[]; pills?: number; tabs?: number };

	/** Сітки таблиць — рядок у рядок ті самі, що в самих сторінках (це перевіряє тест). */
	export const TABLES: Record<string, Table> = {
		'/orders': {
			columns:
				'grid-cols-[40px_minmax(200px,1.6fr)_160px_110px_minmax(180px,1.4fr)_70px_120px_110px]',
			cells: ['num', 'wide', 'badge', 'text', 'image', 'short', 'text', 'text'],
			pills: 2
		},
		'/products': {
			columns: 'grid-cols-[40px_minmax(220px,1.4fr)_minmax(140px,1fr)_130px_200px_110px]',
			cells: ['num', 'image', 'text', 'badge', 'text', 'short'],
			pills: 2
		},
		'/categories': {
			columns: 'grid-cols-[40px_minmax(260px,2fr)_minmax(180px,1fr)_100px_120px]',
			cells: ['num', 'image', 'text', 'short', 'short'],
			pills: 0
		},
		'/discounts': {
			columns: 'grid-cols-[40px_minmax(220px,1.4fr)_110px_minmax(220px,1.6fr)_140px]',
			cells: ['num', 'image', 'short', 'text', 'text'],
			pills: 3
		},
		'/admins': {
			columns:
				'grid-cols-[40px_minmax(220px,1.3fr)_minmax(200px,1fr)_150px_minmax(220px,1.2fr)_120px]',
			cells: ['num', 'avatar', 'text', 'badge', 'wide', 'text'],
			pills: 4
		},
		'/telegram': {
			columns: 'grid-cols-[40px_minmax(200px,1.4fr)_minmax(160px,1fr)_150px_150px_120px]',
			cells: ['num', 'avatar', 'text', 'badge', 'text', 'text'],
			tabs: 2
		}
	};
</script>

<script lang="ts">
	import TableSkeleton from './table-skeleton.svelte';
	import DashboardSkeleton from './dashboard-skeleton.svelte';
	import FormSkeleton from './form-skeleton.svelte';

	/**
	 * Скелетон потрібної сторінки за її адресою. Ті самі сітки колонок, що й у
	 * справжніх таблицях: коли дані приходять, рядки лягають на свої місця.
	 * Використовують і сторінки (перше відкриття), і layout (перехід між ними).
	 */
	let { path }: { path: string } = $props();

	const section = $derived('/' + (path.split('/')[1] ?? ''));
	const isProductCard = $derived(/^\/products\/[^/]+$/.test(path));
	const tableView = $derived(isProductCard ? null : TABLES[section]);
</script>

{#if isProductCard}
	<FormSkeleton />
{:else if section === '/statistics'}
	<DashboardSkeleton tiles={4} />
{:else if section === '/traffic'}
	<DashboardSkeleton tiles={5} tabs={6} />
{:else if tableView}
	<TableSkeleton
		columns={tableView.columns}
		cells={tableView.cells}
		pills={tableView.pills ?? 3}
		tabs={tableView.tabs ?? 0}
	/>
{/if}
