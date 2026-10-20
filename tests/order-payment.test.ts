import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentForStatus } from '$lib/orders';

const db = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));

// Лише те, що торкається дія статусу: прочитати оплату й оновити замовлення.
vi.mock('$lib/server/db', () => ({
	prisma: { order: { findUnique: db.findUnique, update: db.update } }
}));

const { actions } = await import('../src/routes/(app)/orders/+page.server');

function submit(fields: Record<string, string>) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = new Request('http://localhost/orders?/status', { method: 'POST', body });
	return (actions.status as unknown as (e: unknown) => Promise<unknown>)({ request });
}

describe('оплата слідує за статусом', () => {
	it('доставлене — оплачене', () => {
		expect(paymentForStatus('DELIVERED', 'UNPAID')).toBe('PAID');
		expect(paymentForStatus('DELIVERED', 'PAID')).toBeNull();
	});

	it('скасоване — не оплачене, а якщо гроші вже були — повернене', () => {
		expect(paymentForStatus('CANCELLED', 'UNPAID')).toBeNull();
		expect(paymentForStatus('CANCELLED', 'PAID')).toBe('REFUNDED');
		expect(paymentForStatus('CANCELLED', 'REFUNDED')).toBeNull();
	});

	it('проміжні статуси оплату не чіпають', () => {
		for (const status of ['NEW', 'CONFIRMED', 'SHIPPED'] as const) {
			for (const payment of ['UNPAID', 'PAID', 'REFUNDED'] as const) {
				expect(paymentForStatus(status, payment)).toBeNull();
			}
		}
	});
});

describe('дія «статус»', () => {
	beforeEach(() => {
		db.findUnique.mockReset().mockResolvedValue({ paymentStatus: 'UNPAID' });
		db.update.mockReset().mockResolvedValue({ id: 'o1' });
	});

	it('статус і оплата — одним записом', async () => {
		const result = await submit({ id: 'o1', status: 'DELIVERED' });

		expect(db.update).toHaveBeenCalledTimes(1);
		expect(db.update.mock.calls[0][0].data).toEqual({ status: 'DELIVERED', paymentStatus: 'PAID' });
		expect(result).toEqual({ saved: true, payment: 'PAID' });
	});

	it('без потреби оплату не переписує', async () => {
		await submit({ id: 'o1', status: 'SHIPPED' });
		expect(db.update.mock.calls[0][0].data).toEqual({ status: 'SHIPPED' });
	});

	it('невідомий статус — 400, без звернень до бази', async () => {
		const result = await submit({ id: 'o1', status: 'DROP' });
		expect(result).toMatchObject({ status: 400 });
		expect(db.findUnique).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});

	it('немає такого замовлення — 404, нічого не пишемо', async () => {
		db.findUnique.mockResolvedValue(null);
		const result = await submit({ id: 'missing', status: 'DELIVERED' });
		expect(result).toMatchObject({ status: 404 });
		expect(db.update).not.toHaveBeenCalled();
	});
});
