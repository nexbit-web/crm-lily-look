import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stringify } from 'devalue';
import { postAction, succeeded } from '$lib/post-action';

const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

/** Відповідь form action так, як її віддає SvelteKit. */
const reply = (result: object) => new Response(JSON.stringify(result));

describe('дія без форми («Скасувати» в тості, перетягування)', () => {
	it('іде як справжня дія SvelteKit — POST із заголовком x-sveltekit-action', async () => {
		fetchMock.mockResolvedValue(reply({ type: 'success', status: 200 }));

		await postAction('/discounts?/toggle', { id: 'd1' });

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe('/discounts?/toggle');
		expect(init.method).toBe('POST');
		expect(init.headers['x-sveltekit-action']).toBe('true');
		expect((init.body as FormData).get('id')).toBe('d1');
	});

	it('масив — кілька полів з одним імʼям, як у формі з чекбоксами', async () => {
		fetchMock.mockResolvedValue(reply({ type: 'success', status: 200 }));

		await postAction('/categories?/reorder', { parentId: '', ids: ['a', 'b', 'c'] });

		const body = fetchMock.mock.calls[0][1].body as FormData;
		expect(body.getAll('ids')).toEqual(['a', 'b', 'c']);
		expect(body.get('parentId')).toBe('');
	});

	it('дані відповіді розкодовуються, як у use:enhance', async () => {
		fetchMock.mockResolvedValue(
			reply({ type: 'failure', status: 400, data: stringify({ message: 'Ні' }) })
		);

		const result = await postAction('/x?/y', {});

		expect(result).toEqual({ type: 'failure', status: 400, data: { message: 'Ні' } });
		expect(succeeded(result)).toBe(false);
	});

	it('мережа впала — результат error, а не виняток', async () => {
		fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

		const result = await postAction('/x?/y', {});

		expect(result.type).toBe('error');
		expect(succeeded(result)).toBe(false);
	});

	it('успіх — і success, і redirect (так відповідають створення й видалення)', () => {
		expect(succeeded({ type: 'success', status: 200 })).toBe(true);
		expect(succeeded({ type: 'redirect', status: 303, location: '/' })).toBe(true);
		expect(succeeded({ type: 'failure', status: 400 })).toBe(false);
		expect(succeeded({ type: 'error', error: new Error() })).toBe(false);
	});
});
