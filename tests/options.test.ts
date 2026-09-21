import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from './helpers/deferred';
import { DEFAULT_ATTRIBUTE_NAMES } from '$lib/product-attributes';

const db = vi.hoisted(() => ({
	variantGroupBy: vi.fn(),
	attributeGroupBy: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	prisma: {
		productVariant: { groupBy: db.variantGroupBy },
		productAttribute: { groupBy: db.attributeGroupBy }
	}
}));

const { variantOptions } = await import('$lib/server/variant-options');
const { attributeOptions } = await import('$lib/server/attribute-options');

type Args = { by: string[] };

/** Один мок на два різні groupBy: розрізняємо їх за полем `by`. */
function variants(sizes: unknown[], colors: unknown[]) {
	db.variantGroupBy.mockImplementation((args: Args) =>
		Promise.resolve(args.by.includes('size') ? sizes : colors)
	);
}

const size = (label: string, count: number) => ({ size: label, _count: { _all: count } });
const color = (label: string, hex: string | null, count: number) => ({
	color: label,
	colorHex: hex,
	_count: { _all: count }
});

describe('підказки для розмірів і кольорів', () => {
	beforeEach(() => {
		db.variantGroupBy.mockReset();
		variants([], []);
	});

	it('зводить різні написання до найчастішого', () => {
		// Сенс усієї функції: «Чорний» має лишатись одним кольором, а не
		// розповзтись на «чорний», «Чорний » і «ЧОРНИЙ».
		variants(
			[size('S', 1), size('s', 9)],
			[color('Чорний', '#000000', 9), color('чорний', null, 1)]
		);

		return variantOptions().then((options) => {
			expect(options.sizes).toEqual(['s']);
			expect(options.colors).toEqual([{ color: 'Чорний', colorHex: '#000000' }]);
		});
	});

	it('порожні значення в підказки не потрапляють', async () => {
		variants(
			[size('  ', 5), size('M', 1)],
			[color('   ', '#fff', 5), color('Білий', '#ffffff', 1)]
		);

		const options = await variantOptions();

		expect(options.sizes).toEqual(['M']);
		expect(options.colors).toEqual([{ color: 'Білий', colorHex: '#ffffff' }]);
	});

	it('зіпсований HEX не показуємо як колір', async () => {
		variants([], [color('Мокко', '#0000', 3), color('Беж', 'red', 2)]);

		const options = await variantOptions();

		expect(options.colors).toEqual([
			{ color: 'Беж', colorHex: null },
			{ color: 'Мокко', colorHex: null }
		]);
	});

	it('розміри — за частотою, кольори — за абеткою', async () => {
		variants(
			[size('XL', 1), size('M', 7), size('S', 3)],
			[color('Чорний', null, 1), color('Білий', null, 9)]
		);

		const options = await variantOptions();

		expect(options.sizes).toEqual(['M', 'S', 'XL']);
		expect(options.colors.map((item) => item.color)).toEqual(['Білий', 'Чорний']);
	});

	it('обидва запити йдуть паралельно', async () => {
		const gate = deferred<void>();
		let started = 0;

		db.variantGroupBy.mockImplementation(() => {
			started += 1;
			return gate.promise.then(() => []);
		});

		const result = variantOptions();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(started).toBe(2);

		gate.resolve();
		await result;
	});
});

describe('підказки для характеристик', () => {
	beforeEach(() => {
		db.attributeGroupBy.mockReset();
		db.attributeGroupBy.mockResolvedValue([]);
	});

	it('на порожній базі віддає стандартний набір назв', async () => {
		// Перший товар інакше довелось би набирати наосліп.
		const options = await attributeOptions();

		expect(options.map((item) => item.name).sort()).toEqual([...DEFAULT_ATTRIBUTE_NAMES].sort());
		expect(options.every((item) => item.values.length === 0)).toBe(true);
	});

	it('однакова назва в різних регістрах лишається однією характеристикою', async () => {
		db.attributeGroupBy.mockResolvedValue([
			{ name: 'Посадка', value: 'Вільна', _count: { _all: 3 } },
			{ name: 'посадка', value: 'Оверсайз', _count: { _all: 2 } }
		]);

		const options = await attributeOptions();
		const fit = options.filter((item) => item.name.toLowerCase() === 'посадка');

		expect(fit).toHaveLength(1);
		expect(fit[0].values).toEqual(['Вільна', 'Оверсайз']);
	});

	it('значення йдуть від найчастішого й обрізаються на двадцяти', async () => {
		// «Склад» — вільний текст: там значень стільки ж, скільки товарів.
		db.attributeGroupBy.mockResolvedValue(
			Array.from({ length: 30 }, (_, index) => ({
				name: 'Склад',
				value: `варіант ${index}`,
				_count: { _all: index }
			}))
		);

		const options = await attributeOptions();
		const composition = options.find((item) => item.name === 'Склад');

		expect(composition?.values).toHaveLength(20);
		expect(composition?.values[0]).toBe('варіант 29');
	});

	it('порожні назви й значення пропускає', async () => {
		db.attributeGroupBy.mockResolvedValue([
			{ name: '  ', value: 'Сміття', _count: { _all: 5 } },
			{ name: 'Сезон', value: '   ', _count: { _all: 4 } }
		]);

		const options = await attributeOptions();

		expect(options.some((item) => item.name === '')).toBe(false);
		expect(options.find((item) => item.name === 'Сезон')?.values).toEqual([]);
	});

	it('робить один запит на всі характеристики', async () => {
		await attributeOptions();
		expect(db.attributeGroupBy).toHaveBeenCalledTimes(1);
	});
});
