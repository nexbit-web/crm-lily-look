import { describe, expect, it } from 'vitest';
import { autoSku, parseProductForm } from '$lib/server/product-input';

const PHOTO = 'https://res.cloudinary.com/demo/image/upload/v1/lily-look/products/a.jpg';

type Payload = Record<string, unknown>;

/** Мінімально валідний товар; кожен тест псує рівно одне поле. */
function form(overrides: Payload = {}): FormData {
	const base: Payload = {
		name: 'Сукня Вечірня',
		description: 'Опис для сайту',
		categoryId: 'cat-1',
		price: '1299.50',
		images: [{ url: PHOTO, alt: '', color: '' }],
		variants: [{ sku: '', size: 'M', color: 'Чорний', colorHex: '#000000', stock: '3' }],
		measurements: [],
		attributes: []
	};

	const data = new FormData();
	for (const [key, value] of Object.entries({ ...base, ...overrides })) {
		if (value === undefined) continue;
		data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
	}
	return data;
}

describe('розбір форми товару', () => {
	it('приймає коректний товар і переводить ціну в копійки', () => {
		const parsed = parseProductForm(form());
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.value.price).toBe(129950);
		expect(parsed.value.slugBase).toBe('suknia-vechirnia');
		// Чекбокс, якого немає у FormData, — це «знято».
		expect(parsed.value.isActive).toBe(false);
	});

	it('зберігає порядок варіантів так, як їх набрали', () => {
		// Саме через position кольори перестали мінятись місцями після збереження.
		const parsed = parseProductForm(
			form({
				variants: [
					{ sku: '', size: 'M', color: 'Чорний', colorHex: '', stock: '1' },
					{ sku: '', size: 'M', color: 'Білий', colorHex: '', stock: '2' },
					{ sku: '', size: 'M', color: 'Сірий', colorHex: '', stock: '3' }
				]
			})
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.value.variants.map((variant) => [variant.color, variant.position])).toEqual([
			['Чорний', 0],
			['Білий', 1],
			['Сірий', 2]
		]);
	});

	describe('безпека', () => {
		it('не пускає в базу фото з чужого хоста', () => {
			const parsed = parseProductForm(
				form({ images: [{ url: 'https://evil.com/a.jpg', alt: '', color: '' }] })
			);
			expect(parsed.ok).toBe(false);
			if (parsed.ok) return;
			expect(parsed.fieldErrors.images).toBeTruthy();
		});

		it('не падає на зіпсованому JSON у прихованих полях', () => {
			const data = form();
			data.set('variants', '{не json');

			// Зламаний payload — це «немає розмірів», а не 500 на сервері.
			const parsed = parseProductForm(data);
			expect(parsed.ok).toBe(false);
			if (parsed.ok) return;
			expect(parsed.fieldErrors.variants).toBeTruthy();
		});

		it('не приймає JSON, який узагалі не масив', () => {
			const data = form();
			data.set('images', '{"url":"https://evil.com/a.jpg"}');
			expect(parseProductForm(data).ok).toBe(false);
		});
	});

	describe('перевірки полів', () => {
		it('вимагає назву, опис, категорію й ціну', () => {
			const parsed = parseProductForm(
				form({ name: '   ', description: '', categoryId: '', price: 'дорого' })
			);
			expect(parsed.ok).toBe(false);
			if (parsed.ok) return;

			expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
				'categoryId',
				'description',
				'name',
				'price'
			]);
		});

		it('нульова ціна — помилка', () => {
			expect(parseProductForm(form({ price: '0' })).ok).toBe(false);
		});

		it('товар без фото й без розмірів не зберігається', () => {
			const parsed = parseProductForm(form({ images: [], variants: [] }));
			expect(parsed.ok).toBe(false);
			if (parsed.ok) return;
			expect(parsed.fieldErrors.images).toBeTruthy();
			expect(parsed.fieldErrors.variants).toBeTruthy();
		});

		it('пара розмір+колір не може повторюватись — у базі на неї @@unique', () => {
			const parsed = parseProductForm(
				form({
					variants: [
						{ sku: '', size: 'M', color: 'Чорний', colorHex: '', stock: '1' },
						{ sku: '', size: 'm', color: 'чорний', colorHex: '', stock: '2' }
					]
				})
			);
			expect(parsed.ok).toBe(false);
			if (parsed.ok) return;
			expect(parsed.fieldErrors.variants).toMatch(/двічі/);
		});

		it('кількість на складі — ціле число від нуля', () => {
			for (const stock of ['-1', '1.5', 'багато']) {
				const parsed = parseProductForm(
					form({ variants: [{ sku: '', size: 'M', color: 'Чорний', colorHex: '', stock }] })
				);
				expect(parsed.ok).toBe(false);
			}
		});
	});

	describe('звʼязок фото з кольором', () => {
		it('підтягує написання кольору з варіанта', () => {
			// Звʼязок текстовий, без FK: «чорний» і «Чорний» для сайту різні.
			const parsed = parseProductForm(form({ images: [{ url: PHOTO, alt: '', color: 'чОрНиЙ' }] }));
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(parsed.value.images[0].color).toBe('Чорний');
		});

		it('не дає зберегти фото з кольором, якого немає серед розмірів', () => {
			const parsed = parseProductForm(form({ images: [{ url: PHOTO, alt: '', color: 'Синій' }] }));
			expect(parsed.ok).toBe(false);
			if (parsed.ok) return;
			expect(parsed.fieldErrors.images).toMatch(/Синій/);
		});

		it('порожній колір — спільне фото, а alt береться з назви', () => {
			const parsed = parseProductForm(form());
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(parsed.value.images[0].color).toBeNull();
			expect(parsed.value.images[0].alt).toBe('Сукня Вечірня');
		});
	});

	describe('заміри й характеристики', () => {
		it('порожні рядки мовчки відкидаються', () => {
			const parsed = parseProductForm(
				form({
					measurements: [{ size: '', ua: '', chest: '', sleeve: '', length: '' }],
					attributes: [{ name: 'Склад', value: '' }]
				})
			);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(parsed.value.measurements).toEqual([]);
			expect(parsed.value.attributes).toEqual([]);
		});

		it('сантиметри поза межами 1–300 не приймаються', () => {
			const parsed = parseProductForm(
				form({ measurements: [{ size: 'M', ua: '46', chest: '900', sleeve: '', length: '' }] })
			);
			expect(parsed.ok).toBe(false);
		});

		it('дробові сантиметри округлюються — колонка в базі ціла', () => {
			const parsed = parseProductForm(
				form({ measurements: [{ size: 'M', ua: '', chest: '91,5', sleeve: '', length: '' }] })
			);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(parsed.value.measurements[0].chest).toBe(92);
		});

		it('однакова назва характеристики двічі — помилка', () => {
			const parsed = parseProductForm(
				form({
					attributes: [
						{ name: 'Склад', value: 'Бавовна' },
						{ name: 'склад', value: 'Віскоза' }
					]
				})
			);
			expect(parsed.ok).toBe(false);
		});
	});
});

describe('autoSku', () => {
	const variant = { sku: '', size: 'M', color: 'Чорний', colorHex: null, stock: 1, position: 0 };

	it('будує артикул з адреси, розміру й кольору', () => {
		expect(autoSku('suknia', variant)).toBe('suknia-m-chornyi');
	});

	it('не чіпає артикул, вписаний руками', () => {
		expect(autoSku('suknia', { ...variant, sku: 'LL-001' })).toBe('LL-001');
	});
});
