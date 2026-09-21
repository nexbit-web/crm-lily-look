import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('$lib/server/db', () => ({ prisma: { category: { findMany } } }));

const { categoryOptions } = await import('$lib/server/categories');

describe('список категорій для форми', () => {
	beforeEach(() => {
		findMany.mockReset();
		findMany.mockResolvedValue([]);
	});

	it('показує шлях, а не лише назву', async () => {
		// «Вечірні» без батька ні про що не каже, коли таких підкатегорій кілька.
		findMany.mockResolvedValue([
			{ id: 'c1', name: 'Сукні', parentId: null },
			{ id: 'c2', name: 'Вечірні', parentId: 'c1' }
		]);

		expect(await categoryOptions()).toEqual([
			{ id: 'c1', label: 'Сукні' },
			{ id: 'c2', label: 'Сукні → Вечірні' }
		]);
	});

	it('дістає все дерево одним запитом', async () => {
		findMany.mockResolvedValue([
			{ id: 'c1', name: 'Одяг', parentId: null },
			{ id: 'c2', name: 'Сукні', parentId: 'c1' },
			{ id: 'c3', name: 'Вечірні', parentId: 'c2' }
		]);

		const options = await categoryOptions();

		expect(findMany).toHaveBeenCalledTimes(1);
		expect(options[2].label).toBe('Одяг → Сукні → Вечірні');
	});

	it('цикл у дереві не вішає сервер', async () => {
		// Такого не має бути, але як це станеться — сторінка мусить відкритись.
		findMany.mockResolvedValue([
			{ id: 'a', name: 'A', parentId: 'b' },
			{ id: 'b', name: 'B', parentId: 'a' }
		]);

		const options = await categoryOptions();

		expect(options).toHaveLength(2);
		// Глибина обмежена десятьма рівнями — далі шлях просто обривається.
		expect(options[0].label.split(' → ')).toHaveLength(10);
	});

	it('загублений батько не ламає список', async () => {
		findMany.mockResolvedValue([{ id: 'c2', name: 'Вечірні', parentId: 'немає-такої' }]);

		expect(await categoryOptions()).toEqual([{ id: 'c2', label: 'Вечірні' }]);
	});
});
