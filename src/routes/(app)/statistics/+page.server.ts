import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { atLeast } from '$lib/permissions';
import { isPeriod, PERIOD_DAYS, type PeriodKey } from '$lib/statistics';
import type { PageServerLoad } from './$types';

/**
 * Магазин український: доба в статистиці має закінчуватись опівночі в Києві,
 * а не о 02:00 за UTC. Ту саму зону вписано літералом у SQL нижче — там її не
 * можна передати параметром, бо `AT TIME ZONE` чекає константу.
 */
const TZ = 'Europe/Kyiv';

/** Зсув зони від UTC у мілісекундах на конкретний момент (враховує літній час). */
function tzOffset(at: Date): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TZ,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(at);

	const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
	// hourCycle h23 інколи віддає «24» для півночі — нормалізуємо.
	const hour = get('hour') % 24;
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		hour,
		get('minute'),
		get('second')
	);
	return asUtc - at.getTime();
}

/** Момент → «2026-09-06» за київським календарем. */
function dayKey(at: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(at);
}

/**
 * Зсув ключа на N діб. Рахуємо чистою календарною арифметикою в UTC, щоб
 * перехід на літній час не з'їдав і не дублював день.
 */
function shiftKey(key: string, days: number): string {
	const [year, month, day] = key.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** «2026-09-06» → абсолютний момент київської півночі цієї доби. */
function midnight(key: string): Date {
	const utc = new Date(`${key}T00:00:00Z`);
	return new Date(utc.getTime() - tzOffset(utc));
}

/** Відсоток зміни до попереднього такого ж періоду. null — порівнювати нема з чим. */
function delta(current: number, previous: number): number | null {
	if (previous === 0) return current === 0 ? 0 : null;
	return Math.round(((current - previous) / previous) * 100);
}

type DayRow = { day: string; revenue: number; orders: number };
type TopRow = { id: string | null; name: string; units: number; revenue: number };

export const load: PageServerLoad = async ({ url, locals }) => {
	// Сторінка з виручкою — не для операторів. Сайдбар її й так ховає, але
	// прямий перехід за адресою має впертись у ту саму перевірку.
	if (!atLeast(locals.user?.role, 'MANAGER')) {
		error(403, 'Розділ доступний менеджерам і адміністраторам');
	}

	const periodParam = url.searchParams.get('period') ?? '';
	const period: PeriodKey = isPeriod(periodParam) ? periodParam : '30';
	const days = PERIOD_DAYS[period];

	const todayKey = dayKey(new Date());
	const startKey = shiftKey(todayKey, -(days - 1));
	const prevStartKey = shiftKey(todayKey, -(days * 2 - 1));
	const start = midnight(startKey);
	const prevStart = midnight(prevStartKey);

	// Скасовані замовлення не приносять грошей — у виручці, чеку й топі їх немає.
	const sold = { status: { not: 'CANCELLED' } } as const;

	const [current, previous, units, prevUnits, statusRows, dayRows, topRows, lowStock] =
		await Promise.all([
			prisma.order.aggregate({
				where: { ...sold, createdAt: { gte: start } },
				_sum: { total: true },
				_count: { _all: true }
			}),
			prisma.order.aggregate({
				where: { ...sold, createdAt: { gte: prevStart, lt: start } },
				_sum: { total: true },
				_count: { _all: true }
			}),
			prisma.orderItem.aggregate({
				where: { order: { ...sold, createdAt: { gte: start } } },
				_sum: { quantity: true }
			}),
			prisma.orderItem.aggregate({
				where: { order: { ...sold, createdAt: { gte: prevStart, lt: start } } },
				_sum: { quantity: true }
			}),
			// Статуси рахуємо всі, разом зі скасованими: менеджеру важливо бачити,
			// скільки замовлень відвалилось.
			prisma.order.groupBy({
				by: ['status'],
				where: { createdAt: { gte: start } },
				_count: { _all: true }
			}),
			// Дні групує Postgres — тягнути тисячі рядків у Node заради суми не варто.
			// float8 замість bigint: інакше в JSON приїде BigInt, який SvelteKit не серіалізує.
			prisma.$queryRaw<DayRow[]>`
				SELECT to_char("createdAt" AT TIME ZONE 'Europe/Kyiv', 'YYYY-MM-DD') AS day,
				       SUM("total")::float8 AS revenue,
				       COUNT(*)::float8 AS orders
				FROM "Order"
				WHERE "status" <> 'CANCELLED' AND "createdAt" >= ${start}
				GROUP BY 1
			`,
			// Позиція замовлення — знімок: беремо назву з неї, а не з Product,
			// інакше перейменований товар розпався б на два рядки топу.
			prisma.$queryRaw<TopRow[]>`
				SELECT MIN(p."id") AS id,
				       i."productName" AS name,
				       SUM(i."quantity")::float8 AS units,
				       SUM(i."unitPrice" * i."quantity")::float8 AS revenue
				FROM "OrderItem" i
				JOIN "Order" o ON o."id" = i."orderId"
				LEFT JOIN "Product" p ON p."slug" = i."productSlug"
				WHERE o."status" <> 'CANCELLED' AND o."createdAt" >= ${start}
				GROUP BY i."productName"
				ORDER BY revenue DESC
				LIMIT 5
			`,
			prisma.productVariant.findMany({
				where: { isActive: true, stock: { lte: 3 }, product: { isActive: true } },
				orderBy: [{ stock: 'asc' }, { productId: 'asc' }],
				take: 6,
				select: {
					id: true,
					size: true,
					color: true,
					stock: true,
					product: { select: { id: true, name: true } }
				}
			})
		]);

	const revenue = current._sum.total ?? 0;
	const prevRevenue = previous._sum.total ?? 0;
	const orders = current._count._all;
	const prevOrders = previous._count._all;
	const sortedUnits = units._sum.quantity ?? 0;
	const prevSortedUnits = prevUnits._sum.quantity ?? 0;
	const average = orders === 0 ? 0 : Math.round(revenue / orders);
	const prevAverage = prevOrders === 0 ? 0 : Math.round(prevRevenue / prevOrders);

	// Порожні дні мають бути в графіку нулями, інакше провал у продажах
	// виглядав би як рівний ряд.
	const byDay = new Map(dayRows.map((row) => [row.day, row]));
	const daily = Array.from({ length: days }, (_, index) => {
		const key = shiftKey(startKey, index);
		const row = byDay.get(key);
		return { key, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 };
	});

	// Рік — це 365 стовпчиків шириною в піксель; тижні читаються.
	const bucket = days > 120 ? 7 : 1;
	const series = [];
	for (let index = 0; index < daily.length; index += bucket) {
		const chunk = daily.slice(index, index + bucket);
		series.push({
			key: chunk[0].key,
			endKey: chunk[chunk.length - 1].key,
			revenue: chunk.reduce((sum, day) => sum + day.revenue, 0),
			orders: chunk.reduce((sum, day) => sum + day.orders, 0)
		});
	}

	const statuses: Record<string, number> = {};
	for (const row of statusRows) statuses[row.status] = row._count._all;

	return {
		period,
		days,
		bucket,
		startKey,
		metrics: {
			revenue: { value: revenue, delta: delta(revenue, prevRevenue) },
			orders: { value: orders, delta: delta(orders, prevOrders) },
			average: { value: average, delta: delta(average, prevAverage) },
			units: { value: sortedUnits, delta: delta(sortedUnits, prevSortedUnits) }
		},
		series,
		statuses,
		top: topRows.map((row) => ({
			id: row.id,
			name: row.name,
			units: Math.round(row.units),
			revenue: Math.round(row.revenue)
		})),
		lowStock
	};
};
