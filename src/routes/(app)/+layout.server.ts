import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import type { LayoutServerLoad } from './$types';

/** Захищає всю групу (app): без сесії — на сторінку входу. */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}`);
	}

	// Лічильник для бейджа в сайдбарі — тільки читання.
	const newOrders = await prisma.order.count({ where: { status: 'NEW' } });

	return { user: locals.user, newOrders };
};
