/**
 * Відсоток знижки. У базі — `numeric(5,2)`: до двох знаків після коми, 1..90
 * (межі перевіряє ще й CHECK у самій базі).
 */

export const PERCENT_MIN = 1;
export const PERCENT_MAX = 90;

/**
 * «33,6», «33.6», « 20 » → рядок для бази («33.6», «20»). null — не відсоток
 * або поза межами.
 *
 * Рядок, а не число: так значення доходить до `numeric` без похибок float.
 */
export function parsePercent(input: string): string | null {
	// Пробіли лише по краях: «3 3» — помилка, а не 33.
	const normalized = input.trim().replace(/\s*%$/, '').replace(',', '.');
	if (!/^\d{1,2}(\.\d{1,2})?$/.test(normalized)) return null;

	const value = Number(normalized);
	if (value < PERCENT_MIN || value > PERCENT_MAX) return null;

	// «07.50» → «7.5»: у базі й у формі без зайвих нулів.
	return String(value);
}

/** Чи є в значенні дробова частина — «33.6» так, «33» чи «33.0» ні. */
export function isFractional(value: string): boolean {
	return !Number.isInteger(Number(value));
}

/** 33.6 → «33,6», 20 → «20» — для показу. */
export function formatPercent(value: number): string {
	return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(value);
}
