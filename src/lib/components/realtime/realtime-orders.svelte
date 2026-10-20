<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import { Package } from '@lucide/svelte';
	import toast from '$lib/toast.svelte';
	import favicon from '$lib/assets/favicon.svg';
	import { formatUah } from '$lib/money';
	import {
		ORDER_CREATED,
		ORDER_UPDATED,
		ORDERS_CHANNEL,
		ORDERS_DEPENDENCY,
		type OrderCreated,
		type RealtimeConfig
	} from '$lib/realtime';

	/**
	 * Живий звʼязок із Pusher: нове замовлення — сповіщення й свіжий лічильник
	 * без перезавантаження. Нічого не малює; без налаштованого Pusher мовчить.
	 */
	let { config }: { config: RealtimeConfig | null } = $props();

	/** Кілька подій поспіль (масова зміна) — одне перечитування. */
	let refreshTimer: ReturnType<typeof setTimeout> | undefined;
	function refresh() {
		clearTimeout(refreshTimer);
		refreshTimer = setTimeout(() => invalidate(ORDERS_DEPENDENCY), 250);
	}

	function announce(order: OrderCreated) {
		// Картка з двома діями: «Усі нові» (клавіша 2) і «Відкрити» (1) — одразу
		// картка саме цього замовлення.
		toast.info('Нове замовлення', {
			id: `order-${order.id}`,
			icon: Package,
			iconClass: 'bg-[#0090ff]',
			subject: order.number,
			description: ` · ${order.customerName} · ${formatUah(order.total)}`,
			duration: 15_000,
			actions: [
				{ label: 'Усі нові', run: () => goto('/orders?status=NEW') },
				{ label: 'Відкрити', run: () => goto(`/orders?status=NEW&open=${order.id}`) }
			]
		});

		// Вкладка у фоні — ще й системне сповіщення (якщо дозволили в налаштуваннях).
		if (
			document.visibilityState === 'hidden' &&
			'Notification' in window &&
			Notification.permission === 'granted'
		) {
			const notice = new Notification(`Нове замовлення ${order.number}`, {
				body: `${order.customerName} · ${formatUah(order.total)}`,
				icon: favicon,
				tag: `order-${order.id}`
			});
			notice.onclick = () => {
				window.focus();
				goto(`/orders?status=NEW&open=${order.id}`);
				notice.close();
			};
		}
	}

	onMount(() => {
		if (!config) return;
		const { key, cluster } = config;
		let stopped = false;
		let disconnect = () => {};

		// Бібліотеку тягнемо вже після першого показу — сторінка не чекає на неї.
		import('pusher-js').then(({ default: Pusher }) => {
			if (stopped) return;
			const pusher = new Pusher(key, {
				cluster,
				channelAuthorization: { endpoint: '/api/pusher/auth', transport: 'ajax' }
			});
			const channel = pusher.subscribe(ORDERS_CHANNEL);
			channel.bind(ORDER_CREATED, (order: OrderCreated) => {
				announce(order);
				refresh();
			});
			channel.bind(ORDER_UPDATED, refresh);
			disconnect = () => pusher.disconnect();
		});

		return () => {
			stopped = true;
			clearTimeout(refreshTimer);
			disconnect();
		};
	});
</script>
