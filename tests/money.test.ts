import { describe, expect, it } from 'vitest';
import { kopToUahInput, parseUahToKop } from '$lib/money';

/**
 * Надійність даних. Ціна в базі — цілі копійки; будь-яка похибка тут
 * перетворюється на неправильну суму в замовленні.
 */
describe('гривні ↔ копійки', () => {
	it('читає звичайні записи суми', () => {
		expect(parseUahToKop('1299')).toBe(129900);
		expect(parseUahToKop('1299.50')).toBe(129950);
		expect(parseUahToKop('1299,50')).toBe(129950);
		expect(parseUahToKop(' 1 299,5 ')).toBe(129950);
		expect(parseUahToKop('0')).toBe(0);
	});

	it('не втрачає копійку на числах із плаваючою комою', () => {
		// 19.99 * 100 у float — це 1998.9999999999998.
		expect(parseUahToKop('19.99')).toBe(1999);
		expect(parseUahToKop('0.07')).toBe(7);
		expect(parseUahToKop('8.29')).toBe(829);
	});

	it('відхиляє все, що не є сумою', () => {
		for (const bad of ['', '   ', 'abc', '-100', '1.999', '1e3', '12.', '.5', '1,2,3', '٣']) {
			expect(parseUahToKop(bad)).toBeNull();
		}
	});

	it('повертає суму назад у поле без спотворень', () => {
		for (const kop of [0, 7, 1999, 129950, 99999999]) {
			expect(parseUahToKop(kopToUahInput(kop))).toBe(kop);
		}
	});
});
