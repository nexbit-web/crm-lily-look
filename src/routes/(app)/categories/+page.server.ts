import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { isCloudinaryUrl } from '$lib/server/cloudinary';
import { slugify } from '$lib/slug';
import type { Actions, PageServerLoad } from './$types';

/** Глибше трьох рівнів меню магазину не показує, тому й у CRM не даємо. */
const MAX_DEPTH = 2;

/** «Немає батьківської» — Select не вміє порожнє значення, тож маркер. */
const ROOT = 'root';

export const load: PageServerLoad = async () => {
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
	// знає свій відступ і чи є куди його рухати серед сусідів.
	type Row = {
		id: string;
		name: string;
		slug: string;
		imageUrl: string | null;
		parentId: string | null;
		depth: number;
		productCount: number;
		childCount: number;
		canUp: boolean;
		canDown: boolean;
	};

	const categories: Row[] = [];

	function walk(parentId: string | null, depth: number) {
		if (depth > MAX_DEPTH + 2) return;

		const siblings = rows.filter((row) => row.parentId === parentId);
		siblings.forEach((row, index) => {
			categories.push({
				id: row.id,
				name: row.name,
				slug: row.slug,
				imageUrl: row.imageUrl,
				parentId: row.parentId,
				depth,
				productCount: row._count.products,
				childCount: row._count.children,
				canUp: index > 0,
				canDown: index < siblings.length - 1
			});
			walk(row.id, depth + 1);
		});
	}

	walk(null, 0);

	return { categories, total: rows.length };
};

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

	/** Міняє категорію місцями із сусідом і нормалізує весь ряд. */
	move: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const dir = String(form.get('dir') ?? '');

		if (dir !== 'up' && dir !== 'down') return fail(400, { message: 'Невідомий напрямок' });

		const target = await prisma.category.findUnique({
			where: { id },
			select: { parentId: true }
		});
		if (!target) return fail(404, { message: 'Категорію не знайдено' });

		const siblings = await prisma.category.findMany({
			where: { parentId: target.parentId },
			orderBy: [{ position: 'asc' }, { name: 'asc' }],
			select: { id: true }
		});

		const index = siblings.findIndex((sibling) => sibling.id === id);
		const swapWith = dir === 'up' ? index - 1 : index + 1;
		if (index === -1 || swapWith < 0 || swapWith >= siblings.length) return { moved: false };

		[siblings[index], siblings[swapWith]] = [siblings[swapWith], siblings[index]];

		// Позиції в базі часто нульові (default), тому міняти дві з них мало —
		// переписуємо весь ряд, після чого порядок однозначний.
		for (const [position, sibling] of siblings.entries()) {
			await prisma.category.update({ where: { id: sibling.id }, data: { position } });
		}

		return { moved: true };
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
