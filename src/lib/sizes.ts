/**
 * Порядок розмірів: XS йде перед XL, а не за алфавітом.
 *
 * У базі розмір — це довільний текст (`ProductVariant.size`), тому сортувати
 * його можна лише за шкалою, яку ми знаємо. Усе незнайоме — «S/M», «М-XL» —
 * лишається в кінці й зберігає той порядок, у якому його набрали.
 */

/**
 * Кириличні двійники латинських літер. У базі трапляється «4ХL» із кириличною
 * «Х» та «М-XL» із кириличною «М»: на вигляд не відрізнити, а для сортування
 * це вже інший розмір. Підміняємо тільки при порівнянні — у базу пишемо текст
 * рівно таким, яким його ввели.
 */
const LOOKALIKES: Record<string, string> = {
	А: 'A',
	В: 'B',
	Е: 'E',
	І: 'I',
	К: 'K',
	М: 'M',
	Н: 'H',
	О: 'O',
	Р: 'P',
	С: 'C',
	Т: 'T',
	У: 'Y',
	Х: 'X'
};

/** Літерна шкала за зростанням. */
const LADDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL'];

/** Написання, які означають те саме, що й позиція шкали. */
const ALIASES: Record<string, string> = {
	XXXL: '3XL',
	XXXXL: '4XL',
	'2XL': 'XXL',
	'2XS': 'XXS'
};

function normalize(size: string): string {
	const upper = size.trim().toUpperCase();
	let latin = '';
	for (const char of upper) latin += LOOKALIKES[char] ?? char;
	return ALIASES[latin] ?? latin;
}

/**
 * Вага розміру для сортування. Менше — раніше.
 *
 * Літерні розміри йдуть за шкалою, числові (український ряд 38–54) — після
 * них за значенням, решта — у кінці.
 */
export function sizeRank(size: string): number {
	const key = normalize(size);

	const ladder = LADDER.indexOf(key);
	if (ladder >= 0) return ladder;

	if (/^\d{1,3}$/.test(key)) return 100 + Number(key);

	return 1000;
}

/**
 * Сортує за розміром, не змінюючи порядок усередині однакових рангів.
 *
 * Array.prototype.sort стабільний, тож два «S/M» підряд лишаться там, де були,
 * — саме тому невідомі розміри не перемішуються між собою.
 */
export function bySize<T>(items: T[], size: (item: T) => string): T[] {
	return [...items].sort((a, b) => sizeRank(size(a)) - sizeRank(size(b)));
}
