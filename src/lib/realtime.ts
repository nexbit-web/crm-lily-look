/**
 * Події в реальному часі (Pusher Channels): спільне для сервера й браузера.
 *
 * Канал приватний — підписатися може лише співробітник із сесією
 * (/api/pusher/auth), бо в подіях імʼя покупця й сума.
 */
export const ORDERS_CHANNEL = 'private-crm-orders';

/** Ключ для depends()/invalidate(): лічильник і список замовлень. */
export const ORDERS_DEPENDENCY = 'app:orders';

export const ORDER_CREATED = 'order.created';
export const ORDER_UPDATED = 'order.updated';

/** Нове замовлення: лише те, що треба для сповіщення. Решту CRM дочитає з бази. */
export type OrderCreated = {
	id: string;
	number: string;
	customerName: string;
	/** У копійках. */
	total: number;
	items: number;
};

/** Замовлення змінили в CRM (статус або оплату) — інші вкладки перечитують список. */
export type OrderUpdated = { id: string; status?: string };

/** Ключ і кластер публічні за задумом Pusher — їх і віддаємо в браузер. */
export type RealtimeConfig = { key: string; cluster: string };
