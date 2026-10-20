import { describe, expect, it } from 'vitest';
import { ACCENTS, accentCookie, accentCss, DEFAULT_ACCENT, parseAccent } from '$lib/accent';

describe('колір теми', () => {
	it('у кожного співробітника своя cookie', () => {
		expect(accentCookie('u1')).not.toBe(accentCookie('u2'));
	});

	it('з cookie приймається лише відомий колір — решта стає типовим', () => {
		expect(parseAccent('violet')).toBe('violet');
		for (const value of [undefined, null, '', 'red', '</style><script>', 'VIOLET']) {
			expect(parseAccent(value)).toBe(DEFAULT_ACCENT);
		}
	});

	it('у CSS потрапляють лише кольори з переліку, а не текст із cookie', () => {
		expect(accentCss('</style><script>alert(1)</script>')).toBe('');
		for (const accent of ACCENTS) {
			expect(accentCss(accent.id)).not.toMatch(/[<>]/);
		}
	});

	it('типовий графіт — без перевизначень, решта міняє кнопки й сайдбар в обох темах', () => {
		expect(accentCss(DEFAULT_ACCENT)).toBe('');

		const violet = accentCss('violet');
		expect(violet).toContain('--primary:#7b68ee');
		expect(violet).toContain(':root.dark{');
	});

	it('квадратик графіту видно на темному фоні — він не чорний, як сам колір', () => {
		const graphite = ACCENTS.find((accent) => accent.id === DEFAULT_ACCENT);

		expect(graphite?.swatch).toBe('#595d66');
		expect(graphite?.swatch).not.toBe(graphite?.color);
	});

	it('id унікальні, кольори — справжні hex', () => {
		expect(new Set(ACCENTS.map((accent) => accent.id)).size).toBe(ACCENTS.length);
		for (const { color, rail, swatch } of ACCENTS) {
			for (const value of [color, rail, swatch ?? color]) expect(value).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});
