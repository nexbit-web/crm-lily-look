import { prisma } from '$lib/server/db';
import { Prisma } from '$lib/server/prisma-client/client';
import type { PageServerLoad } from './$types';

const PER_PAGE = 15;

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
	const query = (url.searchParams.get('q') ?? '').trim();
	const category = (url.searchParams.get('category') ?? '').trim();
	const sortParam = url.searchParams.get('sort') ?? 'created';
	const sort: SortKey = isSortKey(sortParam) ? sortParam : 'created';

	const rawPage = Number(url.searchParams.get('page') ?? '1');
	const requestedPage = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1);

	// Пошук по назві, адресі та SKU варіанта — те, чим менеджер шукає товар.
	const search: Prisma.ProductWhereInput = query
		? {
				OR: [
					{ name: { contains: query, mode: 'insensitive' } },
					{ slug: { contains: query, mode: 'insensitive' } },
					{ variants: { some: { sku: { contains: query, mode: 'insensitive' } } } }
				]
			}
		: {};

	// Вибір батьківської категорії показує і товари її підкатегорій — інакше
	// «Куртки» давали б порожньо, поки все лежить у «Куртки → Зимові».
	// Фільтр по звʼязку, а не по списку id: тоді дерево не треба знати
	// наперед і всі запити нижче йдуть паралельно.
	const where: Prisma.ProductWhereInput = category
		? { ...search, category: { OR: [{ id: category }, { parentId: category }] } }
		: search;

	// Залишок і кількість варіантів беремо вкладеним select, а не окремим
	// groupBy: 120 цілих чисел у тій самій відповіді дешевші за другий
	// похід до Neon — на серверлесі все вирішує кількість запитів, не рядків.
	const fetchPage = (page: number) =>
		prisma.product.findMany({
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
				categoryId: true,
				category: { select: { name: true } },
				images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
				variants: { select: { stock: true } }
			}
		});

	// Нічого з цього не залежить одне від одного, тому все йде разом:
	// послідовні await коштували б чотирьох затримок до бази замість однієї.
	const [categories, grouped, total, firstTry] = await Promise.all([
		prisma.category.findMany({
			orderBy: [{ position: 'asc' }, { name: 'asc' }],
			select: { id: true, name: true, parentId: true }
		}),
		// Лічильники враховують пошук, але не вибрану категорію — інакше в усіх
		// чипсах, крім вибраного, завжди був би нуль.
		prisma.product.groupBy({ by: ['categoryId'], where: search, _count: { _all: true } }),
		prisma.product.count({ where }),
		fetchPage(requestedPage)
	]);

	const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
	// Сторінка за межами діапазону (напр. після видалення) не має давати
	// пустоту. Трапляється рідко, тож перезапит лише в цьому випадку.
	const page = Math.min(requestedPage, pageCount);
	const products = page === requestedPage ? firstTry : await fetchPage(page);

	const own = new Map(grouped.map((row) => [row.categoryId, row._count._all]));

	// У чипсі батьківської категорії показуємо і її підкатегорії — те саме
	// число, що дасть фільтр, якщо на неї натиснути.
	const categoryChips = categories.map((item) => {
		const children = categories.filter((child) => child.parentId === item.id);
		const count = children.reduce(
			(sum, child) => sum + (own.get(child.id) ?? 0),
			own.get(item.id) ?? 0
		);
		return { id: item.id, name: item.name, isChild: item.parentId !== null, count };
	});

	return {
		total,
		page,
		pageCount,
		perPage: PER_PAGE,
		query,
		sort,
		category: category || null,
		categories: categoryChips,
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
			imageUrl: product.images[0]?.url ?? null,
			stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
			variantCount: product.variants.length
		}))
	};
};
