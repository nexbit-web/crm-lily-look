import { describe, expect, it } from 'vitest';
import { bySize, sizeRank } from '$lib/sizes';

/**
 * Надійність показу. Розмір у базі — довільний текст, тому порядок тримає
 * тільки наша шкала. Помилка тут — це «XL, L, M» у картці товару.
 */
describe('порядок розмірів', () => {
	it('літерна шкала йде за зростанням, а не за алфавітом', () => {
		const sorted = bySize(['XL', 'S', 'XXL', 'M', 'XS', 'L'], (s) => s);
		expect(sorted).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
	});

	it('український ряд сортується числом', () => {
		expect(bySize(['54', '38', '46'], (s) => s)).toEqual(['38', '46', '54']);
	});

	it('літерні розміри йдуть перед числовими', () => {
		expect(sizeRank('XXL')).toBeLessThan(sizeRank('38'));
	});

	it('кирилична «Х» у «4ХL» не ламає порядок', () => {
		// На вигляд не відрізнити від латинської — і саме так її набирають.
		expect(sizeRank('4ХL')).toBe(sizeRank('4XL'));
		expect(sizeRank('М')).toBe(sizeRank('M'));
	});

	it('знає синоніми написання', () => {
		expect(sizeRank('XXXL')).toBe(sizeRank('3XL'));
		expect(sizeRank('2XL')).toBe(sizeRank('XXL'));
	});

	it('незнайомі розміри лишаються в кінці й не перемішуються між собою', () => {
		const sorted = bySize(['S/M', 'L', 'M-XL', 'S'], (s) => s);
		expect(sorted).toEqual(['S', 'L', 'S/M', 'M-XL']);
	});

	it('не змінює вхідний масив', () => {
		const input = ['XL', 'S'];
		bySize(input, (s) => s);
		expect(input).toEqual(['XL', 'S']);
	});
});
