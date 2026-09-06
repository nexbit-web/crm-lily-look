import { fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { categoryOptions } from '$lib/server/categories';
import { parseUahToKop } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

const SCOPES = ['ALL', 'CATEGORY', 'PRODUCT'] as const;
type Scope = (typeof SCOPES)[number];

function isScope(value: string): value is Scope {
	return (SCOPES as readonly string[]).includes(value);
}

export const load: PageServerLoad = async () => {
	const [discounts, categories, products] = await Promise.all([
		prisma.discount.findMany({
			// Увімкнені — зверху: саме вони зараз впливають на ціни.
			orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
			select: {
				id: true,
				name: true,
				scope: true,
				percent: true,
				amount: true,
				isActive: true,
				categories: { select: { categoryId: true } },
				products: { select: { productId: true } }
			}
		}),
		categoryOptions(),
		prisma.product.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } })
	]);

	return {
		categories,
		products: products.map((product) => ({ id: product.id, label: product.name })),
		discounts: discounts.map((discount) => ({
			id: discount.id,
			name: discount.name,
			scope: discount.scope,
			percent: discount.percent,
			amount: discount.amount,
			isActive: discount.isActive,
			categoryIds: discount.categories.map((row) => row.categoryId),
			productIds: discount.products.map((row) => row.productId)
		}))
	};
};

function parseJson(raw: FormDataEntryValue | null): string[] {
	if (typeof raw !== 'string' || raw.trim() === '') return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

export const actions: Actions = {
	/** Одна дія на створення й редагування: різниця лише в наявності id. */
	save: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const name = String(form.get('name') ?? '').trim();
		const kind = String(form.get('kind') ?? 'percent');
		const valueRaw = String(form.get('value') ?? '').trim();
		const scopeRaw = String(form.get('scope') ?? 'ALL');
		const isActive = String(form.get('isActive') ?? '') === 'on';
		const targets = parseJson(form.get('targets'));

		if (name === '') return fail(400, { message: 'Вкажіть назву' });
		if (!isScope(scopeRaw)) return fail(400, { message: 'Невідома область дії' });
		const scope: Scope = scopeRaw;

		// У базі стоїть CHECK: заповнене або percent, або amount — не обидва.
		let percent: number | null = null;
		let amount: number | null = null;

		if (kind === 'percent') {
			percent = Number(valueRaw);
			if (!Number.isInteger(percent) || percent < 1 || percent > 90) {
				return fail(400, { message: 'Відсоток — ціле число від 1 до 90' });
			}
		} else {
			amount = parseUahToKop(valueRaw);
			if (amount === null || amount === 0) {
				return fail(400, { message: 'Сума у гривнях, напр. 150 або 150.50' });
			}
		}

		if (scope !== 'ALL' && targets.length === 0) {
			return fail(400, {
				message:
					scope === 'CATEGORY' ? 'Виберіть хоча б одну категорію' : 'Виберіть хоча б один товар'
			});
		}

		// Ідентифікатори могли застаріти, поки вікно було відкрите.
		const categoryIds =
			scope === 'CATEGORY'
				? (
						await prisma.category.findMany({
							where: { id: { in: targets } },
							select: { id: true }
						})
					).map((row) => row.id)
				: [];
		const productIds =
			scope === 'PRODUCT'
				? (
						await prisma.product.findMany({
							where: { id: { in: targets } },
							select: { id: true }
						})
					).map((row) => row.id)
				: [];

		if (scope !== 'ALL' && categoryIds.length + productIds.length === 0) {
			return fail(400, { message: 'Вибране більше не існує — оновіть сторінку' });
		}

		const data = {
			name,
			scope,
			percent,
			amount,
			isActive,
			categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
			products: { create: productIds.map((productId) => ({ productId })) }
		};

		// Тригери в базі (discount_price_sync і сусідні) самі перерахують
		// finalPrice після кожного з цих записів — руками нічого чіпати не треба.
		if (id === '') {
			await prisma.discount.create({ data });
			return { saved: true };
		}

		const existing = await prisma.discount.findUnique({ where: { id }, select: { id: true } });
		if (!existing) return fail(404, { message: 'Знижку не знайдено' });

		await prisma.discount.update({
			where: { id },
			data: {
				...data,
				// Списки прив'язок простіше перезаписати, ніж звіряти по одному.
				categories: { deleteMany: {}, create: data.categories.create },
				products: { deleteMany: {}, create: data.products.create }
			}
		});

		return { saved: true };
	},

	/** Перемикач прямо в списку: увімкнути чи вимкнути знижку одним кліком. */
	toggle: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();

		const discount = await prisma.discount.findUnique({
			where: { id },
			select: { isActive: true }
		});
		if (!discount) return fail(404, { message: 'Знижку не знайдено' });

		await prisma.discount.update({ where: { id }, data: { isActive: !discount.isActive } });
		return { toggled: true };
	},

	delete: async ({ request }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();

		const discount = await prisma.discount.findUnique({ where: { id }, select: { id: true } });
		if (!discount) return fail(404, { message: 'Знижку не знайдено' });

		// Прив'язки підуть каскадом, ціни перерахує тригер.
		await prisma.discount.delete({ where: { id } });
		return { deleted: true };
	}
};
