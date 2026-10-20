import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moveWithin, withSiblingOrder } from '../src/routes/(app)/categories/tree-order';

const db = vi.hoisted(() => ({
	findMany: vi.fn(),
	update: vi.fn(),
	transaction: vi.fn()
}));

// Лише те, що торкається дія порядку: прочитати сусідів і переписати позиції.
vi.mock('$lib/server/db', () => ({
	prisma: {
		category: { findMany: db.findMany, update: db.update },
		$transaction: db.transaction
	}
}));

const { actions } = await import('../src/routes/(app)/categories/+page.server');

function reorder(parentId: string, ids: string[]) {
	const body = new FormData();
	body.set('parentId', parentId);
	for (const id of ids) body.append('ids', id);
	const request = new Request('http://localhost/categories?/reorder', { method: 'POST', body });
	return (actions.reorder as unknown as (e: unknown) => Promise<unknown>)({ request });
}

describe('порядок ряду після перетягування', () => {
	it('стає перед або після цілі, решта зсувається', () => {
		expect(moveWithin(['a', 'b', 'c', 'd'], 'd', 'b', false)).toEqual(['a', 'd', 'b', 'c']);
		expect(moveWithin(['a', 'b', 'c', 'd'], 'a', 'c', true)).toEqual(['b', 'c', 'a', 'd']);
	});

	it('кинули на себе чи на чужий рядок — без змін', () => {
		expect(moveWithin(['a', 'b'], 'a', 'a', true)).toEqual(['a', 'b']);
		expect(moveWithin(['a', 'b'], 'a', 'x', true)).toEqual(['a', 'b']);
	});

	it('підкатегорії їдуть разом зі своєю категорією', () => {
		const rows = [
			{ id: 'dresses', parentId: null },
			{ id: 'evening', parentId: 'dresses' },
			{ id: 'coats', parentId: null },
			{ id: 'winter', parentId: 'coats' }
		];
		expect(withSiblingOrder(rows, null, ['coats', 'dresses']).map((row) => row.id)).toEqual([
			'coats',
			'winter',
			'dresses',
			'evening'
		]);
	});
});

describe('дія «reorder»', () => {
	beforeEach(() => {
		db.findMany.mockReset().mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
		db.update.mockReset().mockImplementation((args) => args);
		db.transaction.mockReset().mockResolvedValue([]);
	});

	it('увесь ряд — однією транзакцією, позиції за порядком', async () => {
		const result = await reorder('root', ['c', 'a', 'b']);

		expect(db.findMany.mock.calls[0][0].where).toEqual({ parentId: null });
		expect(db.transaction).toHaveBeenCalledTimes(1);
		expect(db.update.mock.calls.map(([args]) => [args.where.id, args.data.position])).toEqual([
			['c', 0],
			['a', 1],
			['b', 2]
		]);
		expect(result).toEqual({ moved: true });
	});

	it('ряд не збігається з базою — 409, нічого не пишемо', async () => {
		for (const ids of [
			['a', 'b'],
			['a', 'b', 'x'],
			['a', 'a', 'b']
		]) {
			expect(await reorder('root', ids)).toMatchObject({ status: 409 });
		}
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it('підкатегорії — у межах свого батька', async () => {
		await reorder('dresses', ['c', 'b', 'a']);
		expect(db.findMany.mock.calls[0][0].where).toEqual({ parentId: 'dresses' });
	});
});
