import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { Prisma } from '$lib/server/prisma-client/client';
import { isOrderStatus, isPaymentStatus, ORDER_STATUSES, type OrderStatusKey } from '$lib/orders';
import type { Actions, PageServerLoad } from './$types';

const PER_PAGE = 20;

export const load: PageServerLoad = async ({ url }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const statusParam = url.searchParams.get('status') ?? '';
	const status: OrderStatusKey | null = isOrderStatus(statusParam) ? statusParam : null;
	const requestedPage = Number(url.searchParams.get('page') ?? '1');

	// Номер, імʼя й телефон — те, чим менеджер шукає замовлення, коли клієнт
	// телефонує. Телефон без insensitive: у ньому немає літер.
	const search: Prisma.OrderWhereInput = query
		? {
				OR: [
					{ number: { contains: query, mode: 'insensitive' } },
					{ customerName: { contains: query, mode: 'insensitive' } },
					{ customerPhone: { contains: query } }
				]
			}
		: {};

	const where: Prisma.OrderWhereInput = status ? { ...search, status } : search;

	// Лічильники враховують пошук, але не фільтр за статусом — інакше в усіх
	// чипсах, крім вибраного, завжди був би нуль.
	const [grouped, total] = await Promise.all([
		prisma.order.groupBy({ by: ['status'], where: search, _count: { _all: true } }),
		prisma.order.count({ where })
	]);

	const counts: Record<string, number> = { ALL: 0 };
	for (const key of ORDER_STATUSES) counts[key] = 0;
	for (const row of grouped) {
		counts[row.status] = row._count._all;
		counts.ALL += row._count._all;
	}

	const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
	// Сторінка за межами діапазону (напр. після зміни фільтра) не має давати пустоту.
	const page = Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), pageCount);

	const orders = await prisma.order.findMany({
		where,
		orderBy: { createdAt: 'desc' },
		skip: (page - 1) * PER_PAGE,
		take: PER_PAGE,
		include: { items: { orderBy: { id: 'asc' } } }
	});

	return { orders, counts, total, page, pageCount, perPage: PER_PAGE, query, status };
};

export const actions: Actions = {
	/** Статус міняється одразу з картки — без окремої кнопки «Зберегти». */
	status: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const value = String(form.get('status') ?? '');

		if (!isOrderStatus(value)) return fail(400, { message: 'Невідомий статус' });

		try {
			await prisma.order.update({ where: { id }, data: { status: value }, select: { id: true } });
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
				return fail(404, { message: 'Замовлення не знайдено' });
			}
			throw err;
		}

		return { saved: true };
	},

	payment: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const value = String(form.get('paymentStatus') ?? '');

		if (!isPaymentStatus(value)) return fail(400, { message: 'Невідомий статус оплати' });

		try {
			await prisma.order.update({
				where: { id },
				data: { paymentStatus: value },
				select: { id: true }
			});
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
				return fail(404, { message: 'Замовлення не знайдено' });
			}
			throw err;
		}

		return { saved: true };
	}
};
