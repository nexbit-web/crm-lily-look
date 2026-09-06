/**
 * Підписи та перевірки для замовлень.
 *
 * Живуть поза $lib/server, бо потрібні і сторінці, і діям: у Prisma це enum,
 * але тягнути згенерований клієнт у браузер заради п'яти рядків не варто.
 */

export const ORDER_STATUSES = ['NEW', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const;
export const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUNDED'] as const;

export type OrderStatusKey = (typeof ORDER_STATUSES)[number];
export type PaymentStatusKey = (typeof PAYMENT_STATUSES)[number];
export type DeliveryMethodKey =
	'NOVA_POSHTA_BRANCH' | 'NOVA_POSHTA_COURIER' | 'UKRPOSHTA_BRANCH' | 'PICKUP';

export function isOrderStatus(value: string): value is OrderStatusKey {
	return (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isPaymentStatus(value: string): value is PaymentStatusKey {
	return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

export const STATUS_LABELS: Record<OrderStatusKey, string> = {
	NEW: 'Нове',
	CONFIRMED: 'Підтверджене',
	SHIPPED: 'Відправлене',
	DELIVERED: 'Доставлене',
	CANCELLED: 'Скасоване'
};

/** Колір крапки в списку: статус має читатись, не відволікаючи. */
export const STATUS_DOTS: Record<OrderStatusKey, string> = {
	NEW: 'bg-ring',
	CONFIRMED: 'bg-amber-500',
	SHIPPED: 'bg-indigo-500',
	DELIVERED: 'bg-emerald-500',
	CANCELLED: 'bg-muted-foreground/40'
};

export const PAYMENT_LABELS: Record<PaymentStatusKey, string> = {
	UNPAID: 'Не оплачено',
	PAID: 'Оплачено',
	REFUNDED: 'Повернено'
};

export const DELIVERY_LABELS: Record<DeliveryMethodKey, string> = {
	NOVA_POSHTA_BRANCH: 'Нова пошта, відділення',
	NOVA_POSHTA_COURIER: 'Нова пошта, курʼєр',
	UKRPOSHTA_BRANCH: 'Укрпошта, відділення',
	PICKUP: 'Самовивіз'
};
