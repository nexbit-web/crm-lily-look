import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
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
 * замовчуванням робить invalidateAll) і на повному перезавантаженні сторінки.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login');

	const newOrders = await prisma.order.count({ where: { status: 'NEW' } });

	// Сайдбару потрібна лише роль, сторінці налаштувань — імʼя й пошта.
	// Решту полів сесії (токени, дати) у браузер не віддаємо.
	const { id, name, email, role } = locals.user;

	return { user: { id, name, email, role }, newOrders };
};
