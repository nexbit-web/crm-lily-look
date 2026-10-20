/**
 * Дрібна математика для лінійних графіків без бібліотек: «кругла» верхня
 * межа осі та плавна лінія, яка не провалюється нижче нуля.
 */

export type Point = { x: number; y: number };

/** Верхня межа осі: 1, 2, 2.5 або 5 × 10ⁿ — підписи виходять круглими. */
export function niceMax(value: number): number {
	if (!(value > 0)) return 1;
	const power = 10 ** Math.floor(Math.log10(value));
	for (const step of [1, 2, 2.5, 5, 10]) {
		if (value <= step * power) return step * power;
	}
	return 10 * power;
}

/**
 * Плавна лінія через точки (монотонна кубічна інтерполяція Фрітча — Карлсона).
 * На відміну від звичайного згладжування, крива не виходить за сусідні
 * значення: між двома нулями не зʼявиться «мінусових» продажів.
 */
export function smoothPath(points: Point[]): string {
	const n = points.length;
	if (n === 0) return '';
	if (n === 1) return `M${points[0].x},${points[0].y}`;

	const dx: number[] = [];
	const slope: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		dx.push(points[i + 1].x - points[i].x);
		slope.push(dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]);
	}

	const tangent: number[] = [slope[0]];
	for (let i = 1; i < n - 1; i++) {
		tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
	}
	tangent.push(slope[n - 2]);

	// Обмеження дотичних — саме воно не дає кривій перестрибувати значення.
	for (let i = 0; i < n - 1; i++) {
		if (slope[i] === 0) {
			tangent[i] = 0;
			tangent[i + 1] = 0;
			continue;
		}
		const a = tangent[i] / slope[i];
		const b = tangent[i + 1] / slope[i];
		const h = a * a + b * b;
		if (h > 9) {
			const t = 3 / Math.sqrt(h);
			tangent[i] = t * a * slope[i];
			tangent[i + 1] = t * b * slope[i];
		}
	}

	const round = (value: number) => Math.round(value * 100) / 100;
	let path = `M${round(points[0].x)},${round(points[0].y)}`;
	for (let i = 0; i < n - 1; i++) {
		const third = dx[i] / 3;
		path +=
			` C${round(points[i].x + third)},${round(points[i].y + tangent[i] * third)}` +
			` ${round(points[i + 1].x - third)},${round(points[i + 1].y - tangent[i + 1] * third)}` +
			` ${round(points[i + 1].x)},${round(points[i + 1].y)}`;
	}
	return path;
}
