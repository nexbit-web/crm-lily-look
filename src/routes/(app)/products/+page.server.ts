import { prisma } from '$lib/server/db';
import { Prisma } from '$lib/server/prisma-client/client';
import type { PageServerLoad } from './$types';

const PER_PAGE = 20;

const SORTS = {
	created: { createdAt: 'desc' },
	name: { name: 'asc' },
	'price-asc': { price: 'asc' },
	'price-desc': { price: 'desc' }
} satisfies Record<string, Prisma.ProductOrderByWithRelationInput>;

export type SortKey = keyof typeof SORTS;

function isSortKey(value: string): value is SortKey {
	return value in SORTS;
}

export const load: PageServerLoad = async ({ url }) => {
	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const query = (url.searchParams.get('q') ?? '').trim();
	const sortParam = url.searchParams.get('sort') ?? 'created';
	const sort: SortKey = isSortKey(sortParam) ? sortParam : 'created';

	// Пошук по назві, адресі та SKU варіанта — те, чим менеджер шукає товар.
	const where: Prisma.ProductWhereInput = query
		? {
				OR: [
					{ name: { contains: query, mode: 'insensitive' } },
					{ slug: { contains: query, mode: 'insensitive' } },
					{ variants: { some: { sku: { contains: query, mode: 'insensitive' } } } }
				]
			}
		: {};

	const total = await prisma.product.count({ where });
	const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
	// Сторінка за межами діапазону (напр. після видалення) не має давати пустоту.
	const page = Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), pageCount);

	const products = await prisma.product.findMany({
		where,
		orderBy: SORTS[sort],
		skip: (page - 1) * PER_PAGE,
		take: PER_PAGE,
		select: {
			id: true,
			name: true,
			slug: true,
			price: true,
			finalPrice: true,
			isActive: true,
			isFeatured: true,
			category: { select: { name: true } },
			images: { orderBy: { position: 'asc' }, take: 1, select: { url: true, alt: true } },
			variants: { select: { stock: true } }
		}
	});

	return {
		total,
		page,
		pageCount,
		perPage: PER_PAGE,
		query,
		sort,
		products: products.map((product) => ({
			id: product.id,
			name: product.name,
			slug: product.slug,
			price: product.price,
			// finalPrice рахує тригер у БД; менше за price — значить діє знижка.
			finalPrice: product.finalPrice,
			isActive: product.isActive,
			isFeatured: product.isFeatured,
			categoryName: product.category?.name ?? '—',
			image: product.images[0] ?? null,
			stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
			variantCount: product.variants.length
		}))
	};
};
