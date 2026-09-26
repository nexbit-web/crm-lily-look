import { latinSize } from './sizes';
import { slugify } from './slug';

/**
 * Артикул варіанта: `<адреса товару>-<розмір>-<колір>`.
 *
 * Артикул їде в Google Merchant Center як ідентифікатор товару й копіюється
 * в замовлення, за яким збирають посилку. Тому він мусить будуватись із
 * поточних назви, розміру й кольору, а не лишатись від картки, з якої товар
 * колись скопіювали.
 *
 * Розмір спершу приводимо до латиниці: кирилична «Х» у «4ХL» на вигляд не
 * відрізняється від латинської, а в артикулі дала б «4khl».
 */
export function skuFor(slug: string, size: string, color: string): string {
	return [slug, slugify(latinSize(size)), slugify(color)].filter(Boolean).join('-');
}

/**
 * Чи побудований цей артикул за правилом вище.
 *
 * Суфікс `-2`, `-3` теж вважається машинним: його додає перевірка на
 * унікальність, коли такий артикул уже зайнятий.
 */
export function isAutoSku(sku: string, slug: string, size: string, color: string): boolean {
	const base = skuFor(slug, size, color);
	if (sku === base) return true;

	const tail = sku.slice(base.length + 1);
	return sku.startsWith(`${base}-`) && /^\d+$/.test(tail);
}
