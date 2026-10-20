import { fail } from '@sveltejs/kit';
import { streamOnFirstLoad } from '$lib/server/stream';
import { prisma } from '$lib/server/db';
import { Prisma } from '$lib/server/prisma-client/client';
import {
	isOrderStatus,
	isPaymentStatus,
	ORDER_STATUSES,
	paymentForStatus,
	type OrderStatusKey,
	type PaymentStatusKey
} from '$lib/orders';
import { cached, invalidate } from '$lib/server/cache';
import { trigger } from '$lib/server/pusher';
import { ORDER_UPDATED, ORDERS_CHANNEL, ORDERS_DEPENDENCY, type OrderUpdated } from '$lib/realtime';
import type { Actions, PageServerLoad } from './$types';

type LoadEvent = Parameters<PageServerLoad>[0];

const PER_PAGE = 20;

/** Одна сторінка списку з лічильниками — те, що лежить у кеші. */
async function readOrders(
	query: string,
	status: OrderStatusKey | null,
	prizeOnly: boolean,
	requestedPage: number
) {
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

	const withPrize: Prisma.OrderWhereInput = { ...search, prize: { not: null } };
	const scope = prizeOnly ? withPrize : search;
	const where: Prisma.OrderWhereInput = status ? { ...scope, status } : scope;

	// Беремо лише те, що показує сторінка: позиції замовлення разом із карткою
	// (окремого запиту при розгортанні немає), але без службових полів на
	// кшталт variantId чи paymentRef — вони нікуди не виводяться.
	const fetchPage = (page: number) =>
		prisma.order.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			skip: (page - 1) * PER_PAGE,
			take: PER_PAGE,
			select: {
				id: true,
				number: true,
				status: true,
				paymentStatus: true,
				customerName: true,
				customerPhone: true,
				customerEmail: true,
				deliveryMethod: true,
				deliveryCity: true,
				deliveryAddress: true,
				comment: true,
				subtotal: true,
				deliveryCost: true,
				total: true,
				prize: true,
				prizeDiscount: true,
				prizeFreeDelivery: true,
				createdAt: true,
				items: {
					orderBy: { id: 'asc' },
					select: {
						id: true,
						productName: true,
						size: true,
						color: true,
						imageUrl: true,
						unitPrice: true,
						quantity: true
					}
				}
			}
		});

	// Лічильники враховують пошук, але не фільтр за статусом — інакше в усіх
	// чипсах, крім вибраного, завжди був би нуль.
	//
	// Сторінку замовлень просимо одразу, ще не знаючи total: у переважній
	// більшості випадків вона в межах діапазону, і тоді все обходиться однією
	// подорожжю до бази замість двох.
	const [grouped, total, firstTry, prizeCount] = await Promise.all([
		prisma.order.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
		prisma.order.count({ where }),
		fetchPage(requestedPage),
		// Для чипа «З призом колеса» — у тому ж пакеті, без окремої подорожі.
		prisma.order.count({ where: withPrize })
	]);

	const counts: Record<string, number> = { ALL: 0 };
	for (const key of ORDER_STATUSES) counts[key] = 0;
	for (const row of grouped) {
		counts[row.status] = row._count._all;
		counts.ALL += row._count._all;
	}

	const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
	// Сторінка за межами діапазону (напр. після зміни фільтра) не має давати
	// пустоту. Трапляється рідко, тож перезапит лише в цьому випадку.
	const page = Math.min(requestedPage, pageCount);
	const orders = page === requestedPage ? firstTry : await fetchPage(page);

	return { orders, counts, prizeCount, total, page, pageCount };
}

const loadView = async ({ url, depends }: LoadEvent) => {
	// Нове замовлення чи зміна з іншої вкладки (Pusher) — список перечитується.
	depends(ORDERS_DEPENDENCY);
	const query = (url.searchParams.get('q') ?? '').trim();
	const statusParam = url.searchParams.get('status') ?? '';
	// Лише замовлення, де спрацював приз колеса фортуни.
	const prizeOnly = url.searchParams.get('prize') === '1';
	const status: OrderStatusKey | null = isOrderStatus(statusParam) ? statusParam : null;
	const rawPage = Number(url.searchParams.get('page') ?? '1');
	const requestedPage = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1);

	// Найвідвідуваніша сторінка CRM — з кешу. Півхвилини, як і лічильник у
	// сайдбарі: замовлення й оплату міняють сайт і бот, а про це CRM дізнається
	// лише з вебхука. Зміни в самому CRM і вебхук нового замовлення кеш
	// скидають одразу.
	const list = await cached(
		`orders:list:${status ?? 'all'}:${prizeOnly ? 'prize' : 'any'}:${requestedPage}:${query}`,
		{ tags: ['orders'], ttl: 30 },
		() => readOrders(query, status, prizeOnly, requestedPage)
	);

	return { ...list, perPage: PER_PAGE, query, status, prizeOnly };
};

/**
 * Перше відкриття — дані стрімом (скелетон одразу), переходи й «Зберегти» —
 * як раніше. Див. $lib/server/stream.
 */
export const load: PageServerLoad = async (event) => {
	return streamOnFirstLoad(event, loadView(event));
};

export const actions: Actions = {
	/** Статус міняється одразу з картки — без окремої кнопки «Зберегти». */
	status: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const value = String(form.get('status') ?? '');

		if (!isOrderStatus(value)) return fail(400, { message: 'Невідомий статус' });

		const current = await prisma.order.findUnique({
			where: { id },
			select: { paymentStatus: true }
		});
		if (!current) return fail(404, { message: 'Замовлення не знайдено' });

		// Оплата підлаштовується під статус: доставлене — оплачене, скасоване —
		// не оплачене (або повернене, якщо гроші вже були). Одним записом.
		const payment = paymentForStatus(value, current.paymentStatus as PaymentStatusKey);

		try {
			await prisma.order.update({
				where: { id },
				data: { status: value, ...(payment ? { paymentStatus: payment } : {}) },
				select: { id: true }
			});
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
				return fail(404, { message: 'Замовлення не знайдено' });
			}
			throw err;
		}

		await announce({ id, status: value });
		return { saved: true, payment };
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

		await announce({ id });
		return { saved: true };
	}
};

/**
 * Інші відкриті вкладки CRM (колега на сусідньому компʼютері) оновлять
 * список без перезавантаження. Кеш скидаємо ще до події — інакше вкладка
 * встигла б перечитати старе (хук скидає кеш лише після відповіді).
 */
async function announce(event: OrderUpdated) {
	await invalidate('orders');
	await trigger(ORDERS_CHANNEL, ORDER_UPDATED, event);
}
