import { error, fail, redirect } from '@sveltejs/kit';
import { Prisma } from '$lib/server/prisma-client/client';
import { prisma } from '$lib/server/db';
import { categoryOptions } from '$lib/server/categories';
import { variantOptions } from '$lib/server/variant-options';
import { autoSku, parseProductForm } from '$lib/server/product-input';
import { kopToUahInput } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const product = await prisma.product.findUnique({
		where: { id: params.id },
		include: {
			images: { orderBy: { position: 'asc' } },
			variants: { orderBy: [{ size: 'asc' }, { color: 'asc' }] },
			measurements: { orderBy: { position: 'asc' } }
		}
	});

	if (!product) error(404, 'Товар не знайдено');

	const [categories, variants] = await Promise.all([categoryOptions(), variantOptions()]);

	return {
		categories,
		sizeOptions: variants.sizes,
		colorOptions: variants.colors,
		product: {
			id: product.id,
			name: product.name,
			slug: product.slug,
			description: product.description,
			categoryId: product.categoryId,
			price: kopToUahInput(product.price),
			finalPrice: product.finalPrice,
			priceKop: product.price,
			isActive: product.isActive,
			isFeatured: product.isFeatured,
			createdAt: product.createdAt,
			updatedAt: product.updatedAt,
			images: product.images.map((image) => ({ url: image.url, alt: image.alt ?? '' })),
			variants: product.variants.map((variant) => ({
				id: variant.id,
				sku: variant.sku,
				size: variant.size,
				color: variant.color,
				colorHex: variant.colorHex ?? '',
				stock: String(variant.stock)
			})),
			measurements: product.measurements.map((row) => ({
				size: row.size,
				ua: row.ua ?? '',
				chest: row.chest === null ? '' : String(row.chest),
				sleeve: row.sleeve === null ? '' : String(row.sleeve),
				length: row.length === null ? '' : String(row.length)
			}))
		}
	};
};

/** Той самий slug у іншого товару зайняти не можна. */
async function uniqueSlug(base: string, exceptId: string): Promise<string> {
	const fallback = base || 'tovar';
	for (let suffix = 0; suffix < 50; suffix += 1) {
		const candidate = suffix === 0 ? fallback : `${fallback}-${suffix + 1}`;
		const taken = await prisma.product.findUnique({
			where: { slug: candidate },
			select: { id: true }
		});
		if (!taken || taken.id === exceptId) return candidate;
	}
	return `${fallback}-${Date.now()}`;
}

export const actions: Actions = {
	save: async ({ request, params }) => {
		const parsed = parseProductForm(await request.formData());

		if (!parsed.ok) {
			return fail(400, { message: 'Перевірте заповнені поля', fieldErrors: parsed.fieldErrors });
		}

		const input = parsed.value;

		const existing = await prisma.product.findUnique({
			where: { id: params.id },
			select: { id: true, variants: { select: { id: true } } }
		});
		if (!existing) error(404, 'Товар не знайдено');

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

		const slug = await uniqueSlug(input.slugBase, params.id);

		// Варіанти, що лишились у формі; решту видаляємо.
		const knownIds = new Set(existing.variants.map((variant) => variant.id));
		const keptIds = input.variants
			.map((variant) => variant.id)
			.filter((id): id is string => Boolean(id) && knownIds.has(id!));

		try {
			// Один update з вкладеними операціями = одна транзакція.
			await prisma.product.update({
				where: { id: params.id },
				data: {
					name: input.name,
					slug,
					description: input.description,
					price: input.price,
					categoryId: input.categoryId,
					isActive: input.isActive,
					isFeatured: input.isFeatured,
					// Фото простіше перезаписати: порядок задає сама форма.
					images: {
						deleteMany: {},
						create: input.images.map((image, position) => ({
							url: image.url,
							alt: image.alt,
							position
						}))
					},
					variants: {
						deleteMany: { id: { notIn: keptIds } },
						update: input.variants
							.filter((variant) => variant.id && knownIds.has(variant.id))
							.map((variant) => ({
								where: { id: variant.id! },
								data: {
									sku: autoSku(slug, variant),
									size: variant.size,
									color: variant.color,
									colorHex: variant.colorHex,
									// Окремої ціни за варіант у CRM більше немає: чистимо
									// поле, щоб напевно діяла ціна товару.
									price: null,
									stock: variant.stock
								}
							})),
						create: input.variants
							.filter((variant) => !variant.id || !knownIds.has(variant.id))
							.map((variant) => ({
								sku: autoSku(slug, variant),
								size: variant.size,
								color: variant.color,
								colorHex: variant.colorHex,
								stock: variant.stock
							}))
					},
					// Заміри ні з чим не звʼязані, тому їх, як і фото, простіше
					// перезаписати цілком, ніж звіряти рядок за рядком.
					measurements: {
						deleteMany: {},
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

		return { saved: true };
	},

	delete: async ({ params }) => {
		try {
			// Фото й варіанти підуть каскадом; позиції замовлень не звʼязані FK,
			// тому історія покупок залишиться цілою.
			await prisma.product.delete({ where: { id: params.id } });
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
				error(404, 'Товар уже видалено');
			}
			throw err;
		}

		redirect(303, '/products');
	}
};
