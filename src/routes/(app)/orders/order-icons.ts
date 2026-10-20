import type { Component } from 'svelte';
import { CircleCheck, CircleDashed, CircleX, PackageCheck, Truck } from '@lucide/svelte';
import type { OrderStatusKey } from '$lib/orders';

/**
 * Значки статусів — одні й ті самі в таблиці, меню фільтра й картці, щоб
 * статус упізнавався з першого погляду. Перевізники — у carrier-icon.svelte.
 */
export const STATUS_ICONS: Record<OrderStatusKey, Component> = {
	// Ще ніхто не взявся — пунктирне коло, «незамкнене».
	NEW: CircleDashed,
	CONFIRMED: CircleCheck,
	SHIPPED: Truck,
	DELIVERED: PackageCheck,
	CANCELLED: CircleX
};
