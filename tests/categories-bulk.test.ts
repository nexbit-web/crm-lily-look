import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Масові дії з панелі вибору: видалити й перенести.
 * Дерево для тестів: Сукні → Вечірні → Довгі, Пальта.
 */
const TREE = [
	{ id: 'dresses', parentId: null },
	{ id: 'evening', parentId: 'dresses' },
	{ id: 'long', parentId: 'evening' },
	{ id: 'coats', parentId: null }
];

const db = vi.hoisted(() => ({
	findMany: vi.fn(),
	findFirst: vi.fn(),
	update: vi.fn(),
	delete: vi.fn(),
	transaction: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	prisma: {
		category: {
			findMany: db.findMany,
			findFirst: db.findFirst,
			update: db.update,
			delete: db.delete
		},
		$transaction: db.transaction
	}
}));

const { actions } = await import('../src/routes/(app)/categories/+page.server');

type Result = { status?: number; data?: { message: string } } & Record<string, unknown>;

function call(action: string, ids: string[], extra: Record<string, string> = {}) {
	const body = new FormData();
	for (const id of ids) body.append('ids', id);
	for (const [key, value] of Object.entries(extra)) body.set(key, value);
	const request = new Request(`http://localhost/categories?/${action}`, { method: 'POST', body });
	return (actions[action] as unknown as (e: unknown) => Promise<Result>)({ request });
}

/** Рядки для перевірки перед видаленням. */
function rows(ids: string[], products: Record<string, number> = {}) {
	return ids.map((id) => ({
		id,
		name: id,
		_count: { products: products[id] ?? 0 },
		children: TREE.filter((row) => row.parentId === id).map((row) => ({ id: row.id }))
	}));
}

beforeEach(() => {
	for (const fn of Object.values(db)) fn.mockReset();
	db.update.mockImplementation((args) => args);
	db.delete.mockImplementation((args) => args);
	db.transaction.mockResolvedValue([]);
	db.findFirst.mockResolvedValue({ position: 4 });
});

describe('масове видалення', () => {
	it('цілу гілку — найглибші першими, однією транзакцією', async () => {
		const ids = ['dresses', 'evening', 'long'];
		db.findMany.mockResolvedValueOnce(rows(ids)).mockResolvedValueOnce(TREE);

		expect(await call('bulkDelete', ids)).toEqual({ deleted: 3 });
		expect(db.delete.mock.calls.map(([args]) => args.where.id)).toEqual([
			'long',
			'evening',
			'dresses'
		]);
		expect(db.transaction).toHaveBeenCalledTimes(1);
	});

	it('батько без своєї підкатегорії у виборі — відмова, нічого не видаляємо', async () => {
		db.findMany.mockResolvedValueOnce(rows(['dresses']));

		const result = await call('bulkDelete', ['dresses']);
		expect(result.status).toBe(400);
		expect(result.data?.message).toContain('підкатегорії');
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it('категорія з товарами — відмова з назвою', async () => {
		db.findMany.mockResolvedValueOnce(rows(['coats'], { coats: 3 }));

		const result = await call('bulkDelete', ['coats']);
		expect(result.status).toBe(400);
		expect(result.data?.message).toContain('«coats»');
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it('частини вже немає — 409', async () => {
		db.findMany.mockResolvedValueOnce(rows(['coats']));
		expect((await call('bulkDelete', ['coats', 'ghost'])).status).toBe(409);
	});
});

describe('масове перенесення', () => {
	beforeEach(() => db.findMany.mockResolvedValue(TREE));

	it('батько й дитина у виборі — переїжджає лише батько, у кінець нового ряду', async () => {
		expect(await call('bulkMove', ['evening', 'long'], { parentId: 'coats' })).toEqual({
			moved: 1
		});
		expect(db.update.mock.calls.map(([args]) => [args.where.id, args.data])).toEqual([
			['evening', { parentId: 'coats', position: 5 }]
		]);
	});

	it('у самих себе чи в нащадка — відмова', async () => {
		const result = await call('bulkMove', ['dresses'], { parentId: 'evening' });
		expect(result.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it('гілка не влазить у три рівні — відмова', async () => {
		// «Довгі» — уже третій рівень, глибше вкладати нікуди.
		const result = await call('bulkMove', ['coats'], { parentId: 'long' });
		expect(result.status).toBe(400);
		expect(result.data?.message).toContain('рівнів');
	});

	it('на верхній рівень', async () => {
		expect(await call('bulkMove', ['long'], { parentId: 'root' })).toEqual({ moved: 1 });
		expect(db.update.mock.calls[0][0].data).toEqual({ parentId: null, position: 5 });
	});
});
