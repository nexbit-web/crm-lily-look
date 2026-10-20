<script lang="ts">
	import Sidebar from '$lib/components/sidebar/Sidebar.svelte';
	import AppHeader from '$lib/components/app-header.svelte';
	import CommandSearch from '$lib/components/search/command-search.svelte';
	import RealtimeOrders from '$lib/components/realtime/realtime-orders.svelte';
	import { navigating, page } from '$app/state';
	import RouteSkeleton, { hasSkeleton } from '$lib/components/skeletons/route-skeleton.svelte';
	import { accentCookie, accentCss, provideAccent } from '$lib/accent';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	let searchOpen = $state(false);

	/** Сторінки-таблиці в стилі ClickUp: на всю ширину панелі, з вузькими
	 *  відступами (8 px згори й справа, 12 px зліва). Решта — по центру, 1010 px. */
	const FULL_WIDTH = [
		'/orders',
		'/products',
		'/categories',
		'/discounts',
		'/statistics',
		'/traffic',
		'/admins',
		'/telegram'
	];
	/**
	 * Перехід на іншу сторінку триває довше за 120 мс (повільний інтернет, база
	 * думає) — показуємо скелетон тієї сторінки, куди йдемо. Коротші переходи
	 * без скелетона: миготіння дратує більше, ніж пауза.
	 */
	let skeletonPath = $state<string | null>(null);
	$effect(() => {
		const target = navigating.to?.url.pathname;
		if (!target || target === page.url.pathname || !hasSkeleton(target)) return;
		const timer = setTimeout(() => (skeletonPath = target), 120);
		return () => {
			clearTimeout(timer);
			skeletonPath = null;
		};
	});

	/** Сторінка, яку видно: та, куди йдемо (скелетон), або поточна. */
	const shownPath = $derived(skeletonPath ?? page.url.pathname);

	/**
	 * Сторінки з картками — на чорній підкладці в темній темі, щоб картки #111
	 * читались контрастно: картка товару (нова чи наявна), статистика й
	 * відвідуваність. Шапка товару лишається кольору панелі.
	 */
	const canvas = $derived(
		/^\/products\/[^/]+$/.test(shownPath) || /^\/(statistics|traffic)(\/|$)/.test(shownPath)
	);
	const wide = $derived(
		FULL_WIDTH.some((path) => shownPath === path || shownPath.startsWith(`${path}/`))
	);

	// Колір теми: із cookie (сервер), а після вибору в налаштуваннях — одразу
	// тут, без перезавантаження.
	let picked = $state<string | null>(null);
	const accent = $derived(picked ?? data.accent);
	const accentStyle = $derived(`<style>${accentCss(accent)}</style>`);

	provideAccent({
		get current() {
			return accent;
		},
		set(id) {
			picked = id;
			document.cookie = `${accentCookie(data.user.id)}=${id}; path=/; max-age=31536000; samesite=lax`;
		}
	});

	/** Ctrl K / ⌘K — пошук з будь-якого місця, навіть із поля вводу. */
	function onkeydown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			searchOpen = !searchOpen;
		}
	}
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<!-- Змінні кольору теми. Вміст — лише з фіксованого переліку ACCENTS,
	     введення користувача сюди не потрапляє. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html accentStyle}
</svelte:head>

<!-- Оболонка як у ClickUp: сіре полотно, на ньому шапка на всю ширину, нижче
     чорний сайдбар і біла робоча панель зі скругленням 12 px. -->
<!-- Шапка 40 px притиснута до верху. Нижче — 6 px від країв вікна й між
     сайдбаром і панеллю. -->
<div class="flex h-svh flex-col bg-shell">
	<AppHeader
		user={{
			name: data.user.name ?? '',
			email: data.user.email,
			role: data.user.role ?? 'OPERATOR'
		}}
		newOrders={data.newOrders}
		onsearch={() => (searchOpen = true)}
	/>

	<div class="flex min-h-0 flex-1 gap-1.5 px-1.5 pb-1.5">
		<Sidebar user={{ role: data.user.role ?? 'OPERATOR' }} newOrders={data.newOrders} />

		<div
			class="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-panel"
		>
			<!-- Одна ширина на всю CRM: 1010 px — далі сторінка не розтягується,
			     нижче просто стискається. Сторінки свою ширину більше не задають. -->
			<main
				class="min-h-0 flex-1 overflow-auto {wide ? 'pt-2 pr-2 pb-2 pl-3' : 'p-6'} {canvas
					? 'bg-canvas'
					: ''}"
			>
				<div class="w-full {wide ? '' : 'mx-auto max-w-252.5'}">
					{#if skeletonPath}
						<RouteSkeleton path={skeletonPath} />
					{:else}
						{@render children()}
					{/if}
				</div>
			</main>
		</div>
	</div>
</div>

<CommandSearch bind:open={searchOpen} role={data.user.role ?? 'OPERATOR'} />

<RealtimeOrders config={data.realtime} />
