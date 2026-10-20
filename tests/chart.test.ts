import { describe, expect, it } from 'vitest';
import { niceMax, smoothPath } from '../src/lib/chart';

describe('вісь графіка', () => {
	it('кругла верхня межа: 1, 2, 2.5 або 5 × 10ⁿ', () => {
		expect(niceMax(0)).toBe(1);
		expect(niceMax(7)).toBe(10);
		expect(niceMax(1800)).toBe(2000);
		expect(niceMax(2300)).toBe(2500);
		expect(niceMax(326_600)).toBe(500_000);
		expect(niceMax(1_000_000)).toBe(1_000_000);
	});
});

describe('плавна лінія', () => {
	it('порожньо й одна точка — без кривих', () => {
		expect(smoothPath([])).toBe('');
		expect(smoothPath([{ x: 5, y: 10 }])).toBe('M5,10');
	});

	it('між двома нулями не провалюється нижче осі', () => {
		// y у SVG росте вниз: «нуль» — це y = 100, пік — y = 0.
		const path = smoothPath([
			{ x: 0, y: 100 },
			{ x: 10, y: 100 },
			{ x: 20, y: 0 },
			{ x: 30, y: 100 },
			{ x: 40, y: 100 }
		]);
		const ys = [...path.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => Number(match[2]));
		expect(Math.max(...ys)).toBeLessThanOrEqual(100);
		expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
	});
});
