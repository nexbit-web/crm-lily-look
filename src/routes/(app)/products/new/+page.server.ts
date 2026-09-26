import { fail, redirect } from '@sveltejs/kit';
import { Prisma } from '$lib/server/prisma-client/client';
import { prisma } from '$lib/server/db';
import { categoryOptions } from '$lib/server/categories';
import { variantOptions } from '$lib/server/variant-options';
import { attributeOptions } from '$lib/server/attribute-options';
import { parseProductForm } from '$lib/server/product-input';
import { uniqueProductSlug } from '$lib/server/product-slug';
import { assignSkus } from '$lib/server/product-sku';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [categories, variants, attributes] = await Promise.all([
		categoryOptions(),
		variantOptions(),
		attributeOptions()
	]);
	return {
		categories,
		sizeOptions: variants.sizes,
		colorOptions: variants.colors,
		attributeOptions: attributes
	};
};

export const actions: Actions = {
	default: async ({ request }) => {
		const parsed = parseProductForm(await request.formData());

		if (!parsed.ok) {
			return fail(400, { message: 'Перевірте заповнені поля', fieldErrors: parsed.fieldErrors });
		}

		const input = parsed.value;

		const slug = await uniqueProductSlug(input.slugBase);
		// Артикули збираються з адреси, розміру й кольору — див. assignSkus().
		const variants = await assignSkus(slug, input.variants);

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
					images: {
						create: input.images.map((image, position) => ({
							url: image.url,
							alt: image.alt,
							color: image.color,
							position
						}))
					},
					variants: {
						create: variants.map((variant) => ({
							sku: variant.sku,
							size: variant.size,
							color: variant.color,
							colorHex: variant.colorHex,
							stock: variant.stock,
							position: variant.position
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
					},
					attributes: {
						create: input.attributes.map((row, position) => ({
							name: row.name,
							value: row.value,
							position
						}))
					}
				},
				select: { id: true }
			});
		} catch (err) {
			if (err instanceof Prisma.PrismaClientKnownRequestError) {
				// Категорію видалили, поки заповнювали форму: окремої перевірки
				// перед записом немає навмисно — зайвий запит до бази на кожне
				// збереження заради випадку, що трапляється раз на рік.
				if (err.code === 'P2003') {
					return fail(400, {
						message: 'Категорію не знайдено',
						fieldErrors: { categoryId: 'Категорія більше не існує — оновіть сторінку' }
					});
				}

				if (err.code === 'P2002') {
					const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'sku';
					if (target.includes('slug')) {
						return fail(400, {
							message: 'Товар із такою адресою щойно створили. Спробуйте зберегти ще раз.',
							fieldErrors: {}
						});
					}
					return fail(400, {
						message: `Значення вже зайняте (${target}). Задайте SKU вручну.`,
						fieldErrors: { variants: 'Такий SKU уже є в базі' }
					});
				}
			}
			throw err;
		}

		redirect(303, '/products');
	}
};
