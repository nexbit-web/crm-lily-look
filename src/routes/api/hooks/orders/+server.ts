import { error, json } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { invalidate } from '$lib/server/cache';
import { sameSecret, trigger } from '$lib/server/pusher';
import { ORDER_CREATED, ORDERS_CHANNEL, type OrderCreated } from '$lib/realtime';
import type { RequestHandler } from './$types';

/**
 * Вебхук для сайту: «щойно створено замовлення». Замовлення пише сайт, і сам
 * CRM про нього не дізнається — тому сайт стукає сюди одразу після запису.
 *
 * POST /api/hooks/orders
 * Authorization: Bearer <CRM_HOOK_SECRET>
 * { "id": "<Order.id>" }   або   { "number": "LL-2K4F7B" }
 *
 * Що робимо: скидаємо кеш замовлень (лічильник у сайдбарі) і шлемо подію в
 * Pusher — відкриті вкладки CRM показують сповіщення без перезавантаження.
 * Дані замовлення беремо з бази, а не з тіла запиту: вебхук лише називає,
 * яке саме.
 *
 * Сесії тут немає — адреса відкрита в hooks.server.ts, захищає секрет.
 */
export const POST: RequestHandler = async ({ request }) => {
	const expected = process.env.CRM_HOOK_SECRET;
	if (!expected) error(503, 'CRM_HOOK_SECRET не заданий');

	const header = request.headers.get('authorization') ?? '';
	const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
	if (!given || !sameSecret(given, expected)) error(401, 'Невірний секрет');

	const body = (await request.json().catch(() => null)) as {
		id?: unknown;
		number?: unknown;
	} | null;
	const id = typeof body?.id === 'string' ? body.id.trim() : '';
	const number = typeof body?.number === 'string' ? body.number.trim() : '';
	if (!id && !number) error(400, 'Потрібен id або number замовлення');

	const order = await prisma.order.findUnique({
		where: id ? { id } : { number },
		select: {
			id: true,
			number: true,
			customerName: true,
			total: true,
			_count: { select: { items: true } }
		}
	});
	if (!order) error(404, 'Замовлення не знайдено');

	await invalidate('orders');

	const event: OrderCreated = {
		id: order.id,
		number: order.number,
		customerName: order.customerName,
		total: order.total,
		items: order._count.items
	};
	const delivered = await trigger(ORDERS_CHANNEL, ORDER_CREATED, event);

	return json({ ok: true, delivered });
};
