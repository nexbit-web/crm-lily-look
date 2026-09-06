import { fail, redirect } from '@sveltejs/kit';
import { Prisma } from '$lib/server/prisma-client/client';
import { prisma } from '$lib/server/db';
import { categoryOptions } from '$lib/server/categories';
import { variantOptions } from '$lib/server/variant-options';
import { autoSku, parseProductForm } from '$lib/server/product-input';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [categories, variants] = await Promise.all([categoryOptions(), variantOptions()]);
	return { categories, sizeOptions: variants.sizes, colorOptions: variants.colors };
};

/** Додає -2, -3… поки slug не стане вільним. */
async function uniqueSlug(base: string): Promise<string> {
	const fallback = base || 'tovar';
	for (let suffix = 0; suffix < 50; suffix += 1) {
		const candidate = suffix === 0 ? fallback : `${fallback}-${suffix + 1}`;
		const taken = await prisma.product.findUnique({
			where: { slug: candidate },
			select: { id: true }
		});
		if (!taken) return candidate;
	}
	return `${fallback}-${Date.now()}`;
}

export const actions: Actions = {
	default: async ({ request }) => {
		const parsed = parseProductForm(await request.formData());

		if (!parsed.ok) {
			return fail(400, { message: 'Перевірте заповнені поля', fieldErrors: parsed.fieldErrors });
		}

		const input = parsed.value;

		const category = await prisma.category.findUnique({
			where: { id: input.categoryId },
			select: { id: true }
		});
		if (!category) {
			return fail(400, {
				message: 'Категорію не знайдено',
				fieldErrors: { categoryId: 'Категорія більше не існує — оновіть сторінку' }
			});
		}

		const slug = await uniqueSlug(input.slugBase);

		try {
			// Вкладений create — одна атомарна операція, без інтерактивної
			// транзакції (вона з Neon-адаптером не завжди доступна).
			await prisma.product.create({
				data: {
					name: input.name,
					slug,
					description: input.description,
					price: input.price,
					categoryId: input.categoryId,
					isActive: input.isActive,
					isFeatured: input.isFeatured,
					images: {
						create: input.images.map((image, position) => ({
							url: image.url,
							alt: image.alt,
							position
						}))
					},
					variants: {
						create: input.variants.map((variant) => ({
							sku: autoSku(slug, variant),
							size: variant.size,
							color: variant.color,
							colorHex: variant.colorHex,
							stock: variant.stock
						}))
					},
					// Порядок рядків задає форма, а не сортування по розміру.
					measurements: {
						create: input.measurements.map((row, position) => ({
							size: row.size,
							ua: row.ua,
							chest: row.chest,
							sleeve: row.sleeve,
							length: row.length,
							position
						}))
					}
				},
				select: { id: true }
			});
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
				const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'sku';
				return fail(400, {
					message: `Значення вже зайняте (${target}). Задайте SKU вручну.`,
					fieldErrors: { variants: 'Такий SKU уже є в базі' }
				});
			}
			throw err;
		}

		redirect(303, '/products');
	}
};
