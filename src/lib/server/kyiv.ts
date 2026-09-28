/**
 * Київський календар для звітів.
 *
 * Магазин український: доба в статистиці має закінчуватись опівночі в Києві,
 * а не о 02:00 за UTC. У базі час лежить в UTC (`timestamp` без зони), тому
 * межі періоду рахуємо тут і передаємо в запит уже переведеними в UTC.
 *
 * У SQL та сама зона вписана літералом: `AT TIME ZONE` чекає константу, і
 * параметром її не передати.
 */
export const TZ = 'Europe/Kyiv';

/** Зсув зони від UTC у мілісекундах на конкретний момент (враховує літній час). */
function tzOffset(at: Date): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TZ,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(at);

	const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
	// hourCycle h23 інколи віддає «24» для півночі — нормалізуємо.
	const hour = get('hour') % 24;
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		hour,
		get('minute'),
		get('second')
	);
	return asUtc - at.getTime();
}

/** Момент → «2026-09-06» за київським календарем. */
export function dayKey(at: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(at);
}

/**
 * Зсув ключа на N діб. Рахуємо чистою календарною арифметикою в UTC, щоб
 * перехід на літній час не з'їдав і не дублював день.
 */
export function shiftKey(key: string, days: number): string {
	const [year, month, day] = key.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** «2026-09-06» → абсолютний момент київської півночі цієї доби. */
export function midnight(key: string): Date {
	const utc = new Date(`${key}T00:00:00Z`);
	return new Date(utc.getTime() - tzOffset(utc));
}

/** Кількість діб від `from` до `to` включно. */
export function daysBetween(from: string, to: string): number {
	const [a, b] = [from, to].map((key) => {
		const [year, month, day] = key.split('-').map(Number);
		return Date.UTC(year, month - 1, day);
	});
	return Math.round((b - a) / 86_400_000) + 1;
}
