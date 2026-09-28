import { error } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { atLeast } from '$lib/permissions';
import { dayKey, midnight, shiftKey } from '$lib/server/kyiv';
import { resolveRange } from '$lib/server/traffic-range';
import {
	DEVICE_LABELS,
	funnel,
	isSource,
	PAGE_LABELS,
	rate,
	type FunnelCounts,
	type SourceKey
} from '$lib/traffic';
import type { PageServerLoad } from './$types';

/**
 * Відвідуваність сайту.
 *
 * Таблицею PageEvent володіє сайт: він її створив і тільки він у неї пише.
 * CRM лише читає — жодного INSERT, UPDATE чи DELETE тут бути не може.
 *
 * Людей рахуємо як count(DISTINCT "visitorId"). Унікальних за період не можна
 * скласти з унікальних по днях: людина, що заходила тричі, дала б три.
 * Тому кожна цифра за період — окремий агрегат за весь період.
 *
 * Джерело фільтруємо nullable-параметром (`$source IS NULL OR source = $source`),
 * а не склеюванням SQL: так кожен запит лишається статичним шаблоном.
 */

/** Скільки товарів показувати у звіті. */
const PRODUCTS_SHOWN = 20;

/** Скільки адрес показувати у звіті «Сторінки». */
const PAGES_SHOWN = 20;

type FunnelRow = {
	visitors: number;
	views: number;
	viewed_product: number;
	added: number;
	checkout: number;
	ordered: number;
};

type SourceRow = FunnelRow & { source: string };
type DayRow = { day: string; visitors: number; views: number };
type ProductRow = {
	path: string;
	id: string | null;
	name: string | null;
	image: string | null;
	viewed: number;
	added: number;
};
type ExitRow = { page: string; count: number };
type DeviceRow = { device: string; visitors: number };
type PageRow = { page: string; path: string; views: number; visitors: number };

function counts(row: FunnelRow | undefined): FunnelCounts {
	return {
		visitors: row?.visitors ?? 0,
		viewedProduct: row?.viewed_product ?? 0,
		added: row?.added ?? 0,
		checkout: row?.checkout ?? 0,
		ordered: row?.ordered ?? 0
	};
}

/**
 * Таблиця може зʼявитись у базі пізніше за код CRM. Перевіряємо це лише
 * тоді, коли запит уже впав: у звичайному випадку зайва подорож до бази ні до чого.
 */
async function tableExists(): Promise<boolean> {
	const [row] = await prisma.$queryRaw<{ exists: boolean }[]>`
		SELECT to_regclass('public."PageEvent"') IS NOT NULL AS exists
	`;
	return Boolean(row?.exists);
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!atLeast(locals.user?.role, 'MANAGER')) {
		error(403, 'Розділ доступний менеджерам і адміністраторам');
	}

	const today = dayKey(new Date());
	const range = resolveRange(url.searchParams, today);
	const sourceParam = url.searchParams.get('source');
	const source: SourceKey | null = isSource(sourceParam) ? sourceParam : null;

	// Межі — київські півночі, переведені в UTC: саме так лежить createdAt.
	const start = midnight(range.from);
	const end = midnight(shiftKey(range.to, 1));

	const base = { range, source, today };

	let result;
	try {
		result = await Promise.all([
			// Підсумки й воронка для вибраного джерела (або всіх разом).
			prisma.$queryRaw<FunnelRow[]>`
				SELECT count(DISTINCT "visitorId")::int                                                   AS visitors,
				       count(*) FILTER (WHERE type = 'view')::int                                         AS views,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'view' AND page = 'product')::int  AS viewed_product,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'add_to_cart')::int                AS added,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'view' AND page = 'checkout')::int AS checkout,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'order')::int                      AS ordered
				FROM "PageEvent"
				WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
				  AND (${source}::text IS NULL OR source = ${source})
			`,

			// По днях за Києвом. Дата — рядком, щоб не гадати з часовим поясом.
			prisma.$queryRaw<DayRow[]>`
				SELECT to_char(("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Kyiv')::date, 'YYYY-MM-DD') AS day,
				       count(DISTINCT "visitorId")::int           AS visitors,
				       count(*) FILTER (WHERE type = 'view')::int AS views
				FROM "PageEvent"
				WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
				  AND (${source}::text IS NULL OR source = ${source})
				GROUP BY 1
			`,

			// Порівняння джерел — це й є розбивка, тому фільтр джерела тут не діє.
			prisma.$queryRaw<SourceRow[]>`
				SELECT source,
				       count(DISTINCT "visitorId")::int                                                   AS visitors,
				       count(*) FILTER (WHERE type = 'view')::int                                         AS views,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'view' AND page = 'product')::int  AS viewed_product,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'add_to_cart')::int                AS added,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'view' AND page = 'checkout')::int AS checkout,
				       count(DISTINCT "visitorId") FILTER (WHERE type = 'order')::int                      AS ordered
				FROM "PageEvent"
				WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
				GROUP BY source
				ORDER BY visitors DESC
			`,

			// Товар шукаємо за адресою: path без префікса /product/ — це slug.
			// Фільтр за path, а не за page: додавання в кошик рахується до
			// товару, звідки б його не зробили.
			prisma.$queryRaw<ProductRow[]>`
				SELECT e.path, p.id, p.name, img.url AS image,
				       count(DISTINCT e."visitorId") FILTER (WHERE e.type = 'view')::int        AS viewed,
				       count(DISTINCT e."visitorId") FILTER (WHERE e.type = 'add_to_cart')::int AS added
				FROM "PageEvent" e
				LEFT JOIN "Product" p ON p.slug = substring(e.path FROM 10)
				LEFT JOIN LATERAL (
					SELECT i.url FROM "ProductImage" i
					WHERE i."productId" = p.id
					ORDER BY i.position
					LIMIT 1
				) img ON true
				WHERE e.path LIKE '/product/%'
				  AND e."createdAt" >= ${start} AND e."createdAt" < ${end}
				  AND (${source}::text IS NULL OR e.source = ${source})
				GROUP BY e.path, p.id, p.name, img.url
				ORDER BY viewed DESC, added DESC
				LIMIT ${PRODUCTS_SHOWN}
			`,

			// Остання сторінка візиту в тих, хто так і не замовив.
			prisma.$queryRaw<ExitRow[]>`
				SELECT page, count(*)::int AS count
				FROM (
					SELECT DISTINCT ON ("visitorId") "visitorId", page
					FROM "PageEvent"
					WHERE type = 'view'
					  AND "createdAt" >= ${start} AND "createdAt" < ${end}
					  AND (${source}::text IS NULL OR source = ${source})
					ORDER BY "visitorId", "createdAt" DESC
				) last
				WHERE NOT EXISTS (
					SELECT 1 FROM "PageEvent" o
					WHERE o."visitorId" = last."visitorId"
					  AND o.type = 'order'
					  AND o."createdAt" >= ${start} AND o."createdAt" < ${end}
				)
				GROUP BY page
				ORDER BY count DESC
			`,

			prisma.$queryRaw<DeviceRow[]>`
				SELECT device, count(DISTINCT "visitorId")::int AS visitors
				FROM "PageEvent"
				WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
				  AND (${source}::text IS NULL OR source = ${source})
				GROUP BY device
				ORDER BY visitors DESC
			`,

			// Усі відкриті адреси: головна, каталоги, товари, кошик — що завгодно.
			prisma.$queryRaw<PageRow[]>`
				SELECT page, path,
				       count(*)::int                    AS views,
				       count(DISTINCT "visitorId")::int AS visitors
				FROM "PageEvent"
				WHERE type = 'view'
				  AND "createdAt" >= ${start} AND "createdAt" < ${end}
				  AND (${source}::text IS NULL OR source = ${source})
				GROUP BY page, path
				ORDER BY views DESC, visitors DESC
				LIMIT ${PAGES_SHOWN}
			`,

			// Для звірки: скільки замовлень за ці ж дні записала сама CRM.
			prisma.order.count({ where: { createdAt: { gte: start, lt: end } } })
		]);
	} catch (err) {
		if (!(await tableExists())) return { ...base, state: 'missing' as const };
		throw err;
	}

	const [[totalsRow], dayRows, sourceRows, productRows, exitRows, deviceRows, pageRows, crmOrders] =
		result;

	const totals = counts(totalsRow);
	if (totals.visitors === 0) return { ...base, state: 'empty' as const };

	// Дні без відвідувачів — нулі, а не дірка в графіку.
	const byDay = new Map(dayRows.map((row) => [row.day, row]));
	const series = Array.from({ length: range.days }, (_, index) => {
		const key = shiftKey(range.from, index);
		const row = byDay.get(key);
		return { key, visitors: row?.visitors ?? 0, views: row?.views ?? 0 };
	});

	const deviceTotal = deviceRows.reduce((sum, row) => sum + row.visitors, 0);
	const exitTotal = exitRows.reduce((sum, row) => sum + row.count, 0);

	return {
		...base,
		state: 'ready' as const,
		crmOrders,
		totals: {
			visitors: totals.visitors,
			views: totalsRow?.views ?? 0,
			added: totals.added,
			ordered: totals.ordered,
			conversion: rate(totals.ordered, totals.visitors)
		},
		series,
		funnel: funnel(totals),
		sources: sourceRows.map((row) => {
			const sourceCounts = counts(row);
			return {
				source: row.source,
				visitors: row.visitors,
				added: row.added,
				ordered: row.ordered,
				conversion: rate(row.ordered, row.visitors),
				funnel: funnel(sourceCounts)
			};
		}),
		products: productRows.map((row) => ({
			path: row.path,
			id: row.id,
			// Товар могли видалити чи перейменувати адресу — лишаємо хоч шлях.
			name: row.name ?? row.path.slice('/product/'.length),
			image: row.image,
			viewed: row.viewed,
			added: row.added,
			rate: rate(row.added, row.viewed)
		})),
		pages: pageRows.map((row) => ({
			path: row.path,
			label: PAGE_LABELS[row.page] ?? row.page,
			views: row.views,
			visitors: row.visitors
		})),
		exits: exitRows.map((row) => ({
			page: row.page,
			label: PAGE_LABELS[row.page] ?? row.page,
			count: row.count,
			share: rate(row.count, exitTotal) ?? 0
		})),
		devices: deviceRows.map((row) => ({
			device: row.device,
			label: DEVICE_LABELS[row.device] ?? row.device,
			visitors: row.visitors,
			share: rate(row.visitors, deviceTotal) ?? 0
		}))
	};
};
