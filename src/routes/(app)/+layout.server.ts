import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { cached } from '$lib/server/cache';
import { accentCookie, parseAccent } from '$lib/accent';
import { realtimeConfig } from '$lib/server/pusher';
import { ORDERS_DEPENDENCY } from '$lib/realtime';
import type { LayoutServerLoad } from './$types';

/**
 * Дані, спільні для всього CRM: співробітник і лічильник нових замовлень.
 *
 * Тут навмисно немає звернення до `url`. SvelteKit перезапускає load лише
 * тоді, коли змінилось те, чого він торкався; варто прочитати url — і цей
 * load разом із запитом до бази повторювався б на КОЖНОМУ переході між
 * сторінками, хоч лічильник у сайдбарі від адреси не залежить.
 *
 * Редірект без сесії лишається за hooks.server.ts: він спрацьовує раніше за
 * load, на всіх запитах включно з form actions, і памʼятає, куди йшов
 * користувач. Перевірка нижче — лише страховка на випадок, що хук колись
 * зміниться.
 *
 * Лічильник оновлюється після кожної дії з формою (use:enhance за
 * замовчуванням робить invalidateAll), на повному перезавантаженні сторінки
 * і щойно Pusher повідомить про нове замовлення.
 */
export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
	if (!locals.user) redirect(303, '/login');

	// Прийшло нове замовлення (Pusher) — браузер перечитає лише лічильник і
	// список замовлень, а не всі дані сторінки (форма товару не скинеться).
	depends(ORDERS_DEPENDENCY);

	// Нові замовлення приходять із сайту, а про це CRM не дізнається — тож лише
	// півхвилини. Зміну статусу в самому CRM кеш бачить одразу (hooks.server.ts).
	const newOrders = await cached('orders:new-count', { tags: ['orders'], ttl: 30 }, () =>
		prisma.order.count({ where: { status: 'NEW' } })
	);

	// Сайдбару потрібна лише роль, сторінці налаштувань — імʼя й пошта.
	// Решту полів сесії (токени, дати) у браузер не віддаємо.
	const { id, name, email, role } = locals.user;

	// Колір теми — свій у кожного співробітника, з cookie браузера.
	const accent = parseAccent(cookies.get(accentCookie(id)));

	return { user: { id, name, email, role }, newOrders, accent, realtime: realtimeConfig() };
};
