import { describe, expect, it } from 'vitest';
import { cloudinaryPreview, cloudinarySrcset, cloudinaryThumb } from '$lib/cloudinary-url';

const PHOTO = 'https://res.cloudinary.com/demo/image/upload/v1789/lily-look/products/abc.jpg';

/**
 * Оптимізація трафіку: оригінал з телефона важить мегабайти, а в CRM він
 * ніде не потрібен цілим. Перевіряємо, що трансформація справді вставляється.
 */
describe('розміри фото в посиланні', () => {
	it('мініатюра обрізається під квадрат', () => {
		expect(cloudinaryThumb(PHOTO, 96)).toContain('/image/upload/w_96,h_96,c_fill,q_auto,f_auto/');
	});

	it('srcset дає подвійний розмір для retina', () => {
		const srcset = cloudinarySrcset(PHOTO, 40);

		expect(srcset).toContain('w_40,h_40');
		expect(srcset).toContain('w_80,h_80');
		expect(srcset.endsWith('2x')).toBe(true);
	});

	it('перегляд вписує фото в розмір, не обрізаючи його', () => {
		// c_limit, а не c_fill: у перегляді на весь екран пропорції мусять
		// лишитись, інакше квадратний кроп показував би не те фото.
		const preview = cloudinaryPreview(PHOTO);

		expect(preview).toContain('c_limit');
		expect(preview).not.toContain('c_fill');
		expect(preview).toContain('w_1600,h_1600');
	});

	it('зберігає версію й шлях до файлу', () => {
		expect(cloudinaryPreview(PHOTO)).toContain('/v1789/lily-look/products/abc.jpg');
	});

	it('чуже посилання віддає без змін', () => {
		for (const url of ['https://evil.com/a.jpg', '', 'не посилання']) {
			expect(cloudinaryPreview(url)).toBe(url);
			expect(cloudinaryThumb(url)).toBe(url);
		}
	});
});
