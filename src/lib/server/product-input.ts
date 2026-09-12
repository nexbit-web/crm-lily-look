import { isCloudinaryUrl } from './cloudinary';
import { parseUahToKop } from '$lib/money';
import { slugify } from '$lib/slug';

type ImagePayload = { url: string; alt: string; color: string };
type VariantPayload = {
	id?: string;
	sku: string;
	size: string;
	color: string;
	colorHex: string;
	stock: string;
};
type MeasurementPayload = {
	size: string;
	ua: string;
	chest: string;
	sleeve: string;
	length: string;
};
type AttributePayload = { name: string; value: string };

export type ParsedVariant = {
	id?: string;
	sku: string;
	size: string;
	color: string;
	colorHex: string | null;
	stock: number;
};

export type ParsedMeasurement = {
	size: string;
	ua: string | null;
	chest: number | null;
	sleeve: number | null;
	length: number | null;
};

export type ParsedAttribute = {
	name: string;
	value: string;
};

export type ParsedProduct = {
	name: string;
	slugBase: string;
	description: string;
	categoryId: string;
	price: number;
	isActive: boolean;
	isFeatured: boolean;
	images: { url: string; alt: string | null; color: string | null }[];
	variants: ParsedVariant[];
	measurements: ParsedMeasurement[];
	attributes: ParsedAttribute[];
};

export type ParseResult =
	{ ok: true; value: ParsedProduct } | { ok: false; fieldErrors: Record<string, string> };

function parseJson<T>(raw: FormDataEntryValue | null): T[] {
	if (typeof raw !== 'string' || raw.trim() === '') return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as T[]) : [];
	} catch {
		return [];
	}
}

/**
 * Сантиметри в замірах: порожньо — це NULL, а не помилка. Дробові округлюємо,
 * бо в базі колонка ціла: «91.5» менеджер усе одно вписує від руки.
 */
function parseCm(raw: string | undefined): { ok: true; value: number | null } | { ok: false } {
	const text = raw?.trim() ?? '';
	if (text === '') return { ok: true, value: null };

	const value = Number(text.replace(',', '.'));
	if (!Number.isFinite(value) || value <= 0 || value > 300) return { ok: false };

	return { ok: true, value: Math.round(value) };
}

/**
 * Розбирає й перевіряє форму товару. Спільна для створення й редагування, щоб
 * правила не розʼїхались між двома сторінками.
 */
export function parseProductForm(form: FormData): ParseResult {
	const name = String(form.get('name') ?? '').trim();
	const description = String(form.get('description') ?? '').trim();
	const categoryId = String(form.get('categoryId') ?? '').trim();
	const priceRaw = String(form.get('price') ?? '').trim();
	const slugRaw = String(form.get('slug') ?? '').trim();
	const isActive = form.get('isActive') === 'on';
	const isFeatured = form.get('isFeatured') === 'on';

	const images = parseJson<ImagePayload>(form.get('images'));
	const variants = parseJson<VariantPayload>(form.get('variants'));
	const measurements = parseJson<MeasurementPayload>(form.get('measurements'));
	const attributes = parseJson<AttributePayload>(form.get('attributes'));

	const fieldErrors: Record<string, string> = {};

	if (name === '') fieldErrors.name = 'Вкажіть назву';
	if (description === '') fieldErrors.description = 'Опис обовʼязковий — він показується на сайті';
	if (categoryId === '') fieldErrors.categoryId = 'Виберіть категорію';

	const price = parseUahToKop(priceRaw);
	if (price === null) fieldErrors.price = 'Ціна у гривнях, напр. 1299 або 1299.50';
	else if (price === 0) fieldErrors.price = 'Ціна не може бути нульовою';

	if (images.length === 0) fieldErrors.images = 'Додайте хоча б одне фото';
	else if (!images.every((image) => isCloudinaryUrl(image.url))) {
		fieldErrors.images = 'Приймаються лише посилання, отримані від Cloudinary';
	}

	if (variants.length === 0) {
		fieldErrors.variants = 'Додайте хоча б один розмір — без нього товару немає на складі';
	}

	// Пари розмір+колір мусять бути унікальні: у базі на них @@unique.
	const seen = new Set<string>();
	const parsedVariants: ParsedVariant[] = [];

	for (const variant of variants) {
		const size = variant.size?.trim() ?? '';
		const color = variant.color?.trim() ?? '';

		// Номер рядка тут не назвеш: у формі варіанти згруповані за розміром,
		// тому в помилках орієнтуємось на самі значення.
		if (size === '' || color === '') {
			fieldErrors.variants = 'Заповніть розмір і назву кольору всюди';
			break;
		}

		const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
		if (seen.has(key)) {
			fieldErrors.variants = `Розмір «${size}» у кольорі «${color}» вказано двічі`;
			break;
		}
		seen.add(key);

		const stock = Number(variant.stock === '' ? 0 : variant.stock);
		if (!Number.isInteger(stock) || stock < 0) {
			fieldErrors.variants = `${size} · ${color}: кількість — ціле число від 0`;
			break;
		}

		// ProductVariant.price лишається NULL: у CRM ціна задається один раз
		// на товар, окремої ціни за розмір чи колір у нас немає.
		parsedVariants.push({
			id: variant.id,
			sku: variant.sku?.trim() ?? '',
			size,
			color,
			colorHex: variant.colorHex?.trim() || null,
			stock
		});
	}

	// Заміри необовʼязкові: блок можна взагалі не чіпати. Рядки, де не заповнили
	// нічого, мовчки викидаємо — інакше «Додати рядок» перетворювався б на пастку.
	const parsedMeasurements: ParsedMeasurement[] = [];
	const seenSizes = new Set<string>();

	for (const [index, row] of measurements.entries()) {
		const size = row.size?.trim() ?? '';
		const ua = row.ua?.trim() ?? '';
		const chest = parseCm(row.chest);
		const sleeve = parseCm(row.sleeve);
		const length = parseCm(row.length);

		const where = size === '' ? `рядок ${index + 1}` : `розмір ${size}`;

		if (!chest.ok || !sleeve.ok || !length.ok) {
			fieldErrors.measurements = `Заміри, ${where}: сантиметри — число від 1 до 300`;
			break;
		}

		const blank =
			size === '' &&
			ua === '' &&
			chest.value === null &&
			sleeve.value === null &&
			length.value === null;
		if (blank) continue;

		if (size === '') {
			fieldErrors.measurements = `Заміри, рядок ${index + 1}: вкажіть розмір`;
			break;
		}

		// На пару (товар, розмір) у базі @@unique.
		const key = size.toLowerCase();
		if (seenSizes.has(key)) {
			fieldErrors.measurements = `Розмір «${size}» додано двічі — обʼєднайте блоки в один`;
			break;
		}
		seenSizes.add(key);

		parsedMeasurements.push({
			size,
			ua: ua || null,
			chest: chest.value,
			sleeve: sleeve.value,
			length: length.value
		});
	}

	// Фото звʼязане з варіантом за текстом кольору, без FK. Тому написання
	// мусить збігатися точно: фото з кольором, якого немає серед розмірів, на
	// сайті не покажеться ніколи. Порожній колір — спільне фото товару.
	const parsedImages = images.map((image) => ({
		url: image.url,
		alt: image.alt?.trim() || name,
		color: image.color?.trim() || null
	}));

	// Коли самі розміри не пройшли перевірку, перелік кольорів неповний —
	// скаржитись на фото тоді означало б показати помилку на порожньому місці.
	if (!fieldErrors.variants && !fieldErrors.images) {
		const byLower = new Map(
			parsedVariants.map((variant) => [variant.color.toLowerCase(), variant.color])
		);

		for (const [index, image] of parsedImages.entries()) {
			if (image.color === null) continue;

			const exact = byLower.get(image.color.toLowerCase());
			if (!exact) {
				fieldErrors.images = `Фото #${index + 1}: кольору «${image.color}» немає серед розмірів`;
				break;
			}

			// Підтягуємо написання варіанта: «чорний» і «Чорний» для текстового
			// звʼязку — різні кольори.
			image.color = exact;
		}
	}

	// Характеристики теж необовʼязкові. Форма підставляє в новий товар назви
	// стандартного набору з порожніми значеннями — рядок без значення це не
	// помилка, а просто «цю характеристику не заповнили».
	const parsedAttributes: ParsedAttribute[] = [];
	const seenNames = new Set<string>();

	for (const [index, row] of attributes.entries()) {
		const attrName = row.name?.trim() ?? '';
		const value = row.value?.trim() ?? '';

		if (value === '') continue;

		if (attrName === '') {
			fieldErrors.attributes = `Характеристики, рядок ${index + 1}: вкажіть назву`;
			break;
		}

		// На пару (товар, назва) у базі @@unique.
		const key = attrName.toLowerCase();
		if (seenNames.has(key)) {
			fieldErrors.attributes = `Характеристику «${attrName}» вказано двічі`;
			break;
		}
		seenNames.add(key);

		parsedAttributes.push({ name: attrName, value });
	}

	if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

	return {
		ok: true,
		value: {
			name,
			slugBase: slugify(slugRaw || name),
			description,
			categoryId,
			price: price!,
			isActive,
			isFeatured,
			images: parsedImages,
			variants: parsedVariants,
			measurements: parsedMeasurements,
			attributes: parsedAttributes
		}
	};
}

/** SKU за замовчуванням: адреса товару + розмір + колір. */
export function autoSku(slug: string, variant: ParsedVariant): string {
	return variant.sku || `${slug}-${slugify(variant.size)}-${slugify(variant.color)}`;
}
