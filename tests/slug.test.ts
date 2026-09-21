import { describe, expect, it } from 'vitest';
import { slugify } from '$lib/slug';

/**
 * Безпека + надійність. Адреса товару підставляється в URL магазину, тому на
 * виході не має бути нічого, крім латиниці, цифр і дефіса.
 */
describe('slugify', () => {
	it('транслітерує українську', () => {
		expect(slugify('Сукня Вечірня XL')).toBe('suknia-vechirnia-xl');
		expect(slugify('Їжак')).toBe('izhak');
	});

	it('вичищає все, що могло б зламати адресу', () => {
		for (const input of [
			'../../etc/passwd',
			'<script>alert(1)</script>',
			'товар?id=1&x=2',
			'a/b\c',
			'  --Кофта--  '
		]) {
			expect(slugify(input)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$|^$/);
		}
	});

	it('не починається й не закінчується дефісом', () => {
		expect(slugify('!!!Кофта!!!')).toBe('kofta');
		expect(slugify('---')).toBe('');
	});

	it('обрізає довгі назви до 80 символів', () => {
		expect(slugify('a'.repeat(200))).toHaveLength(80);
	});

	it('стабільний: повторний прогін нічого не змінює', () => {
		const once = slugify('Сукня «Лілія» 2024 / нова');
		expect(slugify(once)).toBe(once);
	});
});
