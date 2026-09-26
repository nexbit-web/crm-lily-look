import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isAutoSku, skuFor } from '$lib/sku';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('$lib/server/db', () => ({ prisma: { productVariant: { findMany } } }));

const { assignSkus } = await import('$lib/server/product-sku');

/**
 * Артикул їде в Google Merchant Center і в замовлення, за яким збирають
 * посилку. Чужий артикул — це не косметика, а не та річ у пакунку.
 */
describe('правило артикула', () => {
	it('збирається з адреси, розміру й кольору', () => {
		expect(skuFor('bazova-stobana-zhyletka', 'L', 'Чорний')).toBe(
			'bazova-stobana-zhyletka-l-chornyi'
		);
	});

	it('кирилиця в розмірі стає латиницею, а не транслітом', () => {
		// «4ХL» з кириличною Х на вигляд не відрізнити від латинської; за
		// українськими правилами вона дала б «kh» і зламала артикул.
		expect(skuFor('kurtka', '4ХL', 'Чорний')).toBe('kurtka-4xl-chornyi');
		expect(skuFor('kurtka', 'М-XL', 'Чорний')).toBe('kurtka-m-xl-chornyi');
		expect(skuFor('kurtka', 'L/Xl', 'Чорний')).toBe('kurtka-l-xl-chornyi');
	});

	it('колір транслітерується українськими правилами', () => {
		expect(skuFor('palto', 'M', 'Темний хакі з оливковим')).toBe(
			'palto-m-temnyi-khaki-z-olyvkovym'
		);
	});

	it('у результаті лишаються тільки a-z, цифри й дефіс', () => {
		const sku = skuFor('suknia', 'ХS/М', 'Бежевий «пудра», 2024');
		expect(sku).toMatch(/^[a-z0-9-]+$/);
	});

	it('порожній розмір чи колір не дає подвійних дефісів', () => {
		expect(skuFor('suknia', '', 'Чорний')).toBe('suknia-chornyi');
		expect(skuFor('suknia', 'M', '')).toBe('suknia-m');
	});
});

describe('машинний чи ручний', () => {
	it('збіг із правилом — машинний', () => {
		expect(isAutoSku('kurtka-m-chornyi', 'kurtka', 'M', 'Чорний')).toBe(true);
	});

	it('суфікс унікальності теж машинний', () => {
		expect(isAutoSku('kurtka-m-chornyi-2', 'kurtka', 'M', 'Чорний')).toBe(true);
	});

	it('артикул від іншого товару — не машинний', () => {
		// Саме такі й лежать зараз у базі: жилетка з артикулом спідниці.
		expect(isAutoSku('spidnytsia-plisse-adele-l-chornyi', 'bazova-zhyletka', 'L', 'Чорний')).toBe(
			false
		);
	});

	it('дописаний хвіст не вважається суфіксом унікальності', () => {
		expect(isAutoSku('kurtka-m-chornyi-old', 'kurtka', 'M', 'Чорний')).toBe(false);
	});
});

describe('проставляння артикулів', () => {
	beforeEach(() => {
		findMany.mockReset();
		findMany.mockResolvedValue([]);
	});

	it('порожній артикул збирається за правилом', async () => {
		const result = await assignSkus('kurtka', [{ sku: '', size: 'M', color: 'Чорний' }]);
		expect(result[0].sku).toBe('kurtka-m-chornyi');
	});

	it('вписаний руками лишається недоторканим', async () => {
		const result = await assignSkus('kurtka', [{ sku: 'LL-001', size: 'M', color: 'Чорний' }]);
		expect(result[0].sku).toBe('LL-001');
	});

	it('зайнятий артикул отримує суфікс', async () => {
		findMany.mockResolvedValue([{ sku: 'kurtka-m-chornyi' }, { sku: 'kurtka-m-chornyi-2' }]);

		const result = await assignSkus('kurtka', [{ sku: '', size: 'M', color: 'Чорний' }]);

		expect(result[0].sku).toBe('kurtka-m-chornyi-3');
	});

	it('два однакових рядки однієї форми не отримують один артикул', async () => {
		// У базі на sku стоїть UNIQUE — збіг усередині форми поклав би збереження.
		const result = await assignSkus('kurtka', [
			{ sku: '', size: 'M', color: 'Чорний' },
			{ sku: '', size: 'М', color: 'чорний' }
		]);

		expect(result[0].sku).toBe('kurtka-m-chornyi');
		expect(result[1].sku).toBe('kurtka-m-chornyi-2');
	});

	it('ручний артикул займає місце для згенерованих', async () => {
		const result = await assignSkus('kurtka', [
			{ sku: 'kurtka-m-chornyi', size: 'S', color: 'Білий' },
			{ sku: '', size: 'M', color: 'Чорний' }
		]);

		expect(result[1].sku).toBe('kurtka-m-chornyi-2');
	});

	it('власні варіанти товару не рахуються зайнятими', async () => {
		// Інакше кожне збереження зсувало б артикул: -2, -3, -4…
		await assignSkus('kurtka', [{ sku: '', size: 'M', color: 'Чорний' }], 'p1');

		expect(findMany.mock.calls[0][0].where).toEqual({
			sku: { startsWith: 'kurtka-' },
			NOT: { productId: 'p1' }
		});
	});

	it('зайняті адреси беруться одним запитом на весь товар', async () => {
		await assignSkus('kurtka', [
			{ sku: '', size: 'S', color: 'Чорний' },
			{ sku: '', size: 'M', color: 'Чорний' },
			{ sku: '', size: 'L', color: 'Чорний' }
		]);

		expect(findMany).toHaveBeenCalledTimes(1);
	});
});
