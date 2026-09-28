/**
 * Відвідуваність сайту. Дані пише сайт у таблицю PageEvent, CRM лише читає.
 *
 * Тут те, що однаково потрібне серверу й сторінці: назви, періоди й сама
 * воронка. Людей завжди рахуємо як count(DISTINCT visitorId), а не рядки.
 */

export const RANGES = ['today', 'yesterday', '7', '30', 'custom'] as const;

export type RangeKey = (typeof RANGES)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
	today: 'Сьогодні',
	yesterday: 'Вчора',
	'7': '7 днів',
	'30': '30 днів',
	custom: 'Період'
};

export function isRange(value: unknown): value is RangeKey {
	return typeof value === 'string' && (RANGES as readonly string[]).includes(value);
}

/** Звідки прийшла людина. Сайт памʼятає останнє джерело 30 днів. */
export const SOURCES = ['facebook', 'instagram', 'google', 'direct', 'other'] as const;

export type SourceKey = (typeof SOURCES)[number];

export const SOURCE_LABELS: Record<SourceKey, string> = {
	facebook: 'Facebook',
	instagram: 'Instagram',
	google: 'Google',
	direct: 'Напряму',
	other: 'Інше'
};

export function isSource(value: unknown): value is SourceKey {
	return typeof value === 'string' && (SOURCES as readonly string[]).includes(value);
}

/** Тип сторінки, як його записує сайт. Невідомий показуємо як є. */
export const PAGE_LABELS: Record<string, string> = {
	home: 'Головна',
	catalog: 'Каталог',
	collection: 'Добірка',
	product: 'Товар',
	cart: 'Кошик',
	checkout: 'Оформлення',
	order: 'Замовлення',
	info: 'Інформація',
	other: 'Інше'
};

export const DEVICE_LABELS: Record<string, string> = {
	mobile: 'Телефон',
	desktop: 'Компʼютер'
};

/** Рядок воронки з бази: унікальні відвідувачі на кожному кроці. */
export type FunnelCounts = {
	visitors: number;
	viewedProduct: number;
	added: number;
	checkout: number;
	ordered: number;
};

export const FUNNEL_STEPS: { key: keyof FunnelCounts; label: string }[] = [
	{ key: 'visitors', label: 'Зайшли на сайт' },
	{ key: 'viewedProduct', label: 'Дивились товар' },
	{ key: 'added', label: 'Додали в кошик' },
	{ key: 'checkout', label: 'Відкрили оформлення' },
	{ key: 'ordered', label: 'Замовили' }
];

/** Частка у відсотках, округлена. null — ділити нема на що. */
export function rate(part: number, whole: number): number | null {
	return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export type FunnelStep = {
	key: keyof FunnelCounts;
	label: string;
	count: number;
	/** Скільки дійшло з попереднього кроку, у %. У першого кроку — null. */
	pass: number | null;
	/** Тут губиться найбільша частка людей. */
	worst: boolean;
};

/**
 * Воронка з переходами між кроками й позначкою найбільшого провалу.
 *
 * Провал міряємо часткою, що дійшла з попереднього кроку, а не кількістю
 * втрачених людей: інакше перший крок майже завжди «найгірший» просто тому,
 * що людей там найбільше.
 */
export function funnel(counts: FunnelCounts): FunnelStep[] {
	const steps: FunnelStep[] = FUNNEL_STEPS.map((step, index) => {
		const count = counts[step.key];
		const previous = index === 0 ? null : counts[FUNNEL_STEPS[index - 1].key];
		return {
			...step,
			count,
			pass: previous === null ? null : rate(count, previous),
			worst: false
		};
	});

	let worst: FunnelStep | null = null;
	for (const step of steps) {
		if (step.pass === null) continue;
		if (!worst || step.pass < (worst.pass ?? 101)) worst = step;
	}
	if (worst && worst.pass !== null && worst.pass < 100) worst.worst = true;

	return steps;
}
