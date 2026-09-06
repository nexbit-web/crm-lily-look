/**
 * Усі суми в базі — цілі копійки (`Product.price`, `ProductVariant.price`…).
 * Форма показує гривні, тому конвертація живе в одному місці.
 */

/** «1234,50» або «1234.5» → 123450. null, якщо це не сума. */
export function parseUahToKop(input: string): number | null {
	const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
	if (normalized === '' || !/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

	// Рахуємо через рядок: 19.99 * 100 у float дає 1998.9999999999998.
	const [whole, fraction = ''] = normalized.split('.');
	return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 123450 → «1234.50» для value в <input>. */
export function kopToUahInput(kop: number): string {
	return (kop / 100).toFixed(2);
}

/** 123450 → «1 234,50 ₴» для показу. */
export function formatUah(kop: number): string {
	return new Intl.NumberFormat('uk-UA', {
		style: 'currency',
		currency: 'UAH',
		minimumFractionDigits: 2
	}).format(kop / 100);
}
