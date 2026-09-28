import { isRange, type RangeKey } from '$lib/traffic';
import { daysBetween, shiftKey } from './kyiv';

/** Період звіту: київські дати включно з обох боків. */
export type Range = { key: RangeKey; from: string; to: string; days: number };

/**
 * Найдовший власний період. Таблиця росте на рядок за кожен перегляд, і
 * звіт за кілька років одним запитом базі ні до чого.
 */
export const MAX_DAYS = 366;

const DEFAULT: RangeKey = '7';

/** «2026-02-31» відкидаємо: регулярки мало, дату перевіряємо календарем. */
function isDay(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function fixed(key: RangeKey, today: string): Range {
	switch (key) {
		case 'today':
			return { key, from: today, to: today, days: 1 };
		case 'yesterday': {
			const day = shiftKey(today, -1);
			return { key, from: day, to: day, days: 1 };
		}
		case '30':
			return { key, from: shiftKey(today, -29), to: today, days: 30 };
		default:
			return { key: '7', from: shiftKey(today, -6), to: today, days: 7 };
	}
}

/**
 * Період з адреси. Усе незрозуміле — останні 7 днів, а не помилка: це
 * звіт, і відкриватись він мусить завжди.
 *
 * `today` — київська дата «сьогодні», передається ззовні, щоб функцію можна
 * було перевірити без підміни годинника.
 */
export function resolveRange(params: URLSearchParams, today: string): Range {
	const raw = params.get('range');
	const key = isRange(raw) ? raw : DEFAULT;

	if (key !== 'custom') return fixed(key, today);

	const from = params.get('from') ?? '';
	// Майбутнє обрізаємо до сьогодні: подій звідти ще немає.
	const rawTo = params.get('to') ?? '';
	const to = isDay(rawTo) && rawTo > today ? today : rawTo;

	if (!isDay(from) || !isDay(to) || from > to) return fixed(DEFAULT, today);

	const days = daysBetween(from, to);
	if (days > MAX_DAYS) return fixed(DEFAULT, today);

	return { key, from, to, days };
}
