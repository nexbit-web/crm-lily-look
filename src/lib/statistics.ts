/**
 * Періоди для /statistics. Живуть поза $lib/server, бо перемикач у браузері
 * і завантажувач на сервері мусять розуміти одні й ті самі значення.
 */

export const PERIODS = ['7', '30', '90', '365'] as const;

export type PeriodKey = (typeof PERIODS)[number];

export function isPeriod(value: string): value is PeriodKey {
	return (PERIODS as readonly string[]).includes(value);
}

export const PERIOD_DAYS: Record<PeriodKey, number> = {
	'7': 7,
	'30': 30,
	'90': 90,
	'365': 365
};

export const PERIOD_LABELS: Record<PeriodKey, string> = {
	'7': 'Тиждень',
	'30': 'Місяць',
	'90': '3 місяці',
	'365': 'Рік'
};
