import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { streamOnFirstLoad } from '../src/lib/server/stream';
import { viewOf } from '../src/lib/stream';
import TrafficPage from '../src/routes/(app)/traffic/+page.svelte';

/**
 * Перше відкриття сторінки — дані стрімом, скелетон одразу. Переходи й
 * «Зберегти» — готові дані, без скелетона.
 */
describe('стрім даних сторінки', () => {
	const data = { rows: [1, 2, 3] };

	it('повний запит (перше відкриття) — проміс у view', async () => {
		const result = await streamOnFirstLoad({ isDataRequest: false }, Promise.resolve(data));
		expect(result).toHaveProperty('view');
		expect(await (result as { view: Promise<typeof data> }).view).toEqual(data);
	});

	it('перехід чи invalidate — одразу готові дані', async () => {
		expect(await streamOnFirstLoad({ isDataRequest: true }, Promise.resolve(data))).toEqual(data);
		// Тести й скрипти, де прапорця нема, теж отримують готові дані.
		expect(await streamOnFirstLoad({}, Promise.resolve(data))).toEqual(data);
	});

	it('viewOf дістає проміс або віддає дані як є', () => {
		const promise = Promise.resolve(data);
		expect(viewOf({ view: promise })).toBe(promise);
		expect(viewOf(data)).toBe(data);
	});

	it('сторінка, чиї дані ще в дорозі, малює скелетон', () => {
		const { body } = render(TrafficPage, {
			props: { data: { view: new Promise(() => {}) } } as never
		});
		expect(body).toContain('aria-busy="true"');
		expect(body).toContain('skeleton');
	});
});
