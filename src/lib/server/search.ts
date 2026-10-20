import { prisma } from '$lib/server/db';
import { cached } from '$lib/server/cache';
import type { SearchResults, SearchScope } from '$lib/search';

/**
 * Пошук по CRM (Ctrl K): товари, замовлення, категорії.
 *
 * Кожна група — один запит, усі разом. Скільки рядків брати — вирішує
 * область: «Усе» показує по кілька найкращих із кожної групи, вкладка —
 * більше, але все одно обмежено, щоб відповідь не росла з базою.
 *
 * Результат кешується на пів хвилини: людина друкує й стирає, а та сама
 * фраза двічі поспіль — звичайна справа. Нові замовлення з сайту побачить
 * не пізніше ніж за 30 секунд.
 */

const MIN_LENGTH = 2;
const MAX_LENGTH = 64;
const LIMIT_ALL = 5;
const LIMIT_ONE = 20;

export function normalizeQuery(raw: string | null): string {
	return (raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH);
}

export async function search(rawQuery: string | null, scope: SearchScope): Promise<SearchResults> {
	const query = normalizeQuery(rawQuery);
	const empty: SearchResults = { query, products: [], orders: [], categories: [] };
	if (query.length < MIN_LENGTH) return empty;

	return cached(
		`search:${scope}:${query.toLowerCase()}`,
		{ tags: ['products', 'orders', 'categories'], ttl: 30 },
		() => run(query, scope)
	);
}

async function run(query: string, scope: SearchScope): Promise<SearchResults> {
	const take = scope === 'all' ? LIMIT_ALL : LIMIT_ONE;
	const wants = (group: SearchScope) => scope === 'all' || scope === group;
	const contains = { contains: query, mode: 'insensitive' as const };

	// Телефон у базі може бути «+380 67 …» чи «0671…» — шукаємо за цифрами.
	const digits = query.replace(/\D/g, '');

	const [products, orders, categories] = await Promise.all([
		wants('products')
			? prisma.product.findMany({
					where: {
						OR: [{ name: contains }, { slug: contains }, { variants: { some: { sku: contains } } }]
					},
					orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
					take,
					select: {
						id: true,
						name: true,
						price: true,
						finalPrice: true,
						isActive: true,
						category: { select: { name: true } },
						images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } }
					}
				})
			: [],
		wants('orders')
			? prisma.order.findMany({
					where: {
						OR: [
							{ number: contains },
							{ customerName: contains },
							...(digits.length >= 3 ? [{ customerPhone: { contains: digits } }] : [])
						]
					},
					orderBy: { createdAt: 'desc' },
					take,
					select: {
						id: true,
						number: true,
						customerName: true,
						total: true,
						status: true,
						createdAt: true
					}
				})
			: [],
		wants('categories')
			? prisma.category.findMany({
					where: { name: contains },
					orderBy: [{ position: 'asc' }, { name: 'asc' }],
					take,
					select: {
						id: true,
						name: true,
						parent: { select: { name: true } },
						_count: { select: { products: true } }
					}
				})
			: []
	]);

	return {
		query,
		products: products.map((product) => ({
			id: product.id,
			name: product.name,
			category: product.category?.name ?? null,
			image: product.images[0]?.url ?? null,
			price: product.finalPrice > 0 ? product.finalPrice : product.price,
			isActive: product.isActive
		})),
		orders: orders.map((order) => ({
			id: order.id,
			number: order.number,
			customer: order.customerName,
			total: order.total,
			status: order.status,
			createdAt: order.createdAt.toISOString()
		})),
		categories: categories.map((category) => ({
			id: category.id,
			name: category.name,
			parent: category.parent?.name ?? null,
			products: category._count.products
		}))
	};
}
