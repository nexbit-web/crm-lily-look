import { fail } from '@sveltejs/kit';
import { streamOnFirstLoad } from '$lib/server/stream';
import { prisma } from '$lib/server/db';
import { cached } from '$lib/server/cache';
import { isCloudinaryUrl } from '$lib/server/cloudinary';
import { slugify } from '$lib/slug';
import type { Actions, PageServerLoad } from './$types';

/** Глибше трьох рівнів меню магазину не показує, тому й у CRM не даємо. */
const MAX_DEPTH = 2;

/** «Немає батьківської» — Select не вміє порожнє значення, тож маркер. */
const ROOT = 'root';

// Категорії міняє лише CRM, а кожна зміна скидає кеш — тож хоч на добу.
// Кількість товарів у категорії міняється разом із товарами — тег products.
/**
 * Перше відкриття — дані стрімом (скелетон одразу), переходи й «Зберегти» —
 * як раніше. Див. $lib/server/stream.
 */
export const load: PageServerLoad = (event) =>
	streamOnFirstLoad(
		event,
		cached('categories:tree', { tags: ['categories', 'products'], ttl: 86_400 }, readCategories)
	);

async function readCategories() {
	const rows = await prisma.category.findMany({
		orderBy: [{ position: 'asc' }, { name: 'asc' }],
		select: {
			id: true,
			name: true,
			slug: true,
			imageUrl: true,
			parentId: true,
			_count: { select: { products: true, children: true } }
		}
	});

	// Дерево розкладаємо в плаский список у порядку показу: кожен рядок одразу
	// знає свій відступ.
	type Row = {
		id: string;
		name: string;
		slug: string;
		imageUrl: string | null;
		parentId: string | null;
		depth: number;
		productCount: number;
		childCount: number;
	};

	const categories: Row[] = [];

	function walk(parentId: string | null, depth: number) {
		if (depth > MAX_DEPTH + 2) return;

		for (const row of rows.filter((item) => item.parentId === parentId)) {
			categories.push({
				id: row.id,
				name: row.name,
				slug: row.slug,
				imageUrl: row.imageUrl,
				parentId: row.parentId,
				depth,
				productCount: row._count.products,
				childCount: row._count.children
			});
			walk(row.id, depth + 1);
		}
	}

	walk(null, 0);

	return { categories, total: rows.length };
}

/** Мапа «дитина → батько» для перевірок циклів і глибини. */
async function tree(): Promise<Map<string, string | null>> {
	const rows = await prisma.category.findMany({ select: { id: true, parentId: true } });
	return new Map(rows.map((row) => [row.id, row.parentId]));
}

function depthOf(map: Map<string, string | null>, id: string): number {
	let depth = 0;
	let current = map.get(id) ?? null;
	// Обмеження на випадок зіпсованого дерева — краще зупинитись, ніж зависнути.
	while (current && depth < 20) {
		depth += 1;
		current = map.get(current) ?? null;
	}
	return depth;
}

/** true, якщо `candidate` — це сама категорія або хтось із її нащадків. */
function isSelfOrDescendant(map: Map<string, string | null>, candidate: string, id: string) {
	let current: string | null = candidate;
	for (let depth = 0; current && depth < 20; depth += 1) {
		if (current === id) return true;
		current = map.get(current) ?? null;
	}
	return false;
}

/** Додає -2, -3… поки адреса не стане вільною. */
async function uniqueSlug(base: string): Promise<string> {
	const fallback = base || 'kategoriia';
	for (let suffix = 0; suffix < 50; suffix += 1) {
		const candidate = suffix === 0 ? fallback : `${fallback}-${suffix + 1}`;
		const taken = await prisma.category.findUnique({
			where: { slug: candidate },
			select: { id: true }
		});
		if (!taken) return candidate;
	}
	return `${fallback}-${Date.now()}`;
}

/** Нова категорія стає останньою серед своїх сусідів. */
async function nextPosition(parentId: string | null): Promise<number> {
	const last = await prisma.category.findFirst({
		where: { parentId },
		orderBy: { position: 'desc' },
		select: { position: true }
	});
	return (last?.position ?? -1) + 1;
}

/** Скільки рівнів під категорією (0 — без підкатегорій). */
function heightOf(map: Map<string, string | null>, id: string, depth = 0): number {
	if (depth > 20) return 0;
	let height = 0;
	for (const [child, parent] of map) {
		if (parent === id) height = Math.max(height, 1 + heightOf(map, child, depth + 1));
	}
	return height;
}

/** Ідентифікатори з форми масової дії: без порожніх і повторів. */
function selectedIds(form: FormData): string[] {
	return [...new Set(form.getAll('ids').map((value) => String(value).trim()))].filter(Boolean);
}

export const actions: Actions = {
	/** Одна дія на створення й редагування: різниця лише в наявності id. */
	save: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const parentRaw = String(form.get('parentId') ?? '').trim();
		const imageUrl = String(form.get('imageUrl') ?? '').trim();

		if (name === '') return fail(400, { message: 'Вкажіть назву' });
		if (imageUrl !== '' && !isCloudinaryUrl(imageUrl)) {
			return fail(400, { message: 'Обкладинку приймаємо лише з Cloudinary' });
		}

		const parentId = parentRaw === '' || parentRaw === ROOT ? null : parentRaw;
		const map = await tree();

		if (parentId) {
			if (!map.has(parentId)) return fail(400, { message: 'Батьківської категорії більше немає' });
			if (id && isSelfOrDescendant(map, parentId, id)) {
				return fail(400, { message: 'Категорію не можна вкласти в саму себе' });
			}
			if (depthOf(map, parentId) >= MAX_DEPTH) {
				return fail(400, { message: `Глибше ${MAX_DEPTH + 1} рівнів вкладати не можна` });
			}
		}

		if (id === '') {
			await prisma.category.create({
				data: {
					name,
					slug: await uniqueSlug(slugify(name)),
					imageUrl: imageUrl || null,
					parentId,
					position: await nextPosition(parentId)
				}
			});
			return { saved: true };
		}

		const current = await prisma.category.findUnique({
			where: { id },
			select: { parentId: true }
		});
		if (!current) return fail(404, { message: 'Категорію не знайдено' });

		await prisma.category.update({
			where: { id },
			data: {
				name,
				imageUrl: imageUrl || null,
				parentId,
				// Адресу лишаємо як є: перейменування не має ламати посилання,
				// які вже десь опубліковані.
				...(current.parentId === parentId
					? {}
					: // Переїхала до іншого батька — стає останньою в новому ряду.
						{ position: await nextPosition(parentId) })
			}
		});

		return { saved: true };
	},

	/**
	 * Новий порядок сусідів після перетягування мишею: `ids` — увесь ряд
	 * однієї батьківської категорії в потрібному порядку.
	 *
	 * Записуємо, лише якщо ряд збігається з базою один в один: інакше
	 * (хтось у сусідній вкладці додав чи переніс категорію) порядок
	 * переплутався б — краще попросити оновити сторінку.
	 */
	reorder: async ({ request }) => {
		const form = await request.formData();
		const parentRaw = String(form.get('parentId') ?? '').trim();
		const parentId = parentRaw === '' || parentRaw === ROOT ? null : parentRaw;
		const ids = form.getAll('ids').map((value) => String(value));

		const siblings = await prisma.category.findMany({
			where: { parentId },
			select: { id: true }
		});
		const known = new Set(siblings.map((sibling) => sibling.id));
		const sameSet =
			ids.length === known.size &&
			new Set(ids).size === ids.length &&
			ids.every((id) => known.has(id));
		if (!sameSet) return fail(409, { message: 'Список змінився — оновіть сторінку' });

		// Весь ряд одним махом: або новий порядок цілком, або старий.
		await prisma.$transaction(
			ids.map((id, position) =>
				prisma.category.update({ where: { id }, data: { position }, select: { id: true } })
			)
		);

		return { moved: true };
	},

	/**
	 * Видалити кілька категорій разом. Можна й цілу гілку: батька з усіма
	 * підкатегоріями — тоді діти йдуть першими. Не видаляємо нічого, якщо
	 * хоч одна категорія з товарами або має підкатегорію поза вибором.
	 */
	bulkDelete: async ({ request }) => {
		const ids = selectedIds(await request.formData());
		if (ids.length === 0) return fail(400, { message: 'Нічого не вибрано' });

		const rows = await prisma.category.findMany({
			where: { id: { in: ids } },
			select: {
				id: true,
				name: true,
				_count: { select: { products: true } },
				children: { select: { id: true } }
			}
		});
		if (rows.length !== ids.length) {
			return fail(409, { message: 'Частини категорій уже немає — оновіть сторінку' });
		}

		const chosen = new Set(ids);
		const withProducts = rows.filter((row) => row._count.products > 0);
		if (withProducts.length > 0) {
			const names = withProducts.map((row) => `«${row.name}»`).join(', ');
			return fail(400, { message: `У ${names} ще є товари — спершу перенесіть їх` });
		}
		const orphaning = rows.filter((row) => row.children.some((child) => !chosen.has(child.id)));
		if (orphaning.length > 0) {
			const names = orphaning.map((row) => `«${row.name}»`).join(', ');
			return fail(400, {
				message: `У ${names} є підкатегорії, яких немає у виборі — виберіть і їх або перенесіть`
			});
		}

		// Найглибші — першими: на дітях стоїть SetNull, і батько, видалений
		// раніше, підняв би їх у корінь посеред транзакції.
		const map = await tree();
		const ordered = [...ids].sort((a, b) => depthOf(map, b) - depthOf(map, a));
		await prisma.$transaction(
			ordered.map((id) => prisma.category.delete({ where: { id }, select: { id: true } }))
		);

		return { deleted: ids.length };
	},

	/**
	 * Перенести вибрані категорії під іншого батька (або на верхній рівень).
	 * Підкатегорії їдуть разом зі своєю: якщо вибрано й батька, і дитину,
	 * переноситься лише батько — гілка не розсипається.
	 */
	bulkMove: async ({ request }) => {
		const form = await request.formData();
		const ids = selectedIds(form);
		const parentRaw = String(form.get('parentId') ?? '').trim();
		const parentId = parentRaw === '' || parentRaw === ROOT ? null : parentRaw;
		if (ids.length === 0) return fail(400, { message: 'Нічого не вибрано' });

		const map = await tree();
		if (ids.some((id) => !map.has(id))) {
			return fail(409, { message: 'Частини категорій уже немає — оновіть сторінку' });
		}
		if (parentId && !map.has(parentId)) {
			return fail(400, { message: 'Батьківської категорії більше немає' });
		}

		const chosen = new Set(ids);
		// Лише верхні з вибраних: у кого жоден предок не вибраний.
		const roots = ids.filter((id) => {
			let current = map.get(id) ?? null;
			for (let depth = 0; current && depth < 20; depth += 1) {
				if (chosen.has(current)) return false;
				current = map.get(current) ?? null;
			}
			return true;
		});

		if (parentId && roots.some((id) => isSelfOrDescendant(map, parentId, id))) {
			return fail(400, { message: 'Категорію не можна вкласти в саму себе' });
		}
		const base = parentId ? depthOf(map, parentId) + 1 : 0;
		if (roots.some((id) => base + heightOf(map, id) > MAX_DEPTH)) {
			return fail(400, { message: `Глибше ${MAX_DEPTH + 1} рівнів вкладати не можна` });
		}

		// У новому ряду — в кінці, у тому порядку, як ішли в таблиці.
		const moving = roots.filter((id) => (map.get(id) ?? null) !== parentId);
		const start = await nextPosition(parentId);
		await prisma.$transaction(
			moving.map((id, index) =>
				prisma.category.update({
					where: { id },
					data: { parentId, position: start + index },
					select: { id: true }
				})
			)
		);

		return { moved: moving.length };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();

		const category = await prisma.category.findUnique({
			where: { id },
			select: { name: true, _count: { select: { products: true, children: true } } }
		});
		if (!category) return fail(404, { message: 'Категорію не знайдено' });

		// У БД на товарах стоїть Restrict, а на дітях — SetNull: без цих двох
		// перевірок перше падало б помилкою Prisma, а друге тихо піднімало
		// підкатегорії в корінь.
		if (category._count.products > 0) {
			return fail(400, {
				message: `У «${category.name}» ще ${category._count.products} товар(ів) — спершу перенесіть їх`
			});
		}
		if (category._count.children > 0) {
			return fail(400, {
				message: `У «${category.name}» є підкатегорії — спершу перенесіть або видаліть їх`
			});
		}

		await prisma.category.delete({ where: { id } });
		return { deleted: true };
	}
};
