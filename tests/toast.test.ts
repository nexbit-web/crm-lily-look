import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast, { toasts } from '../src/lib/toast.svelte';

describe('тости', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		toast.dismiss();
		vi.useRealTimers();
	});

	it('зникають самі; з діями чи undo — тримаються довше', () => {
		toast.success('Збережено');
		toast.message('Знижку вимкнено.', { undo: () => {} });

		vi.advanceTimersByTime(4000);
		expect(toasts.items.map((item) => item.title)).toEqual(['Знижку вимкнено.']);
		vi.advanceTimersByTime(4000);
		expect(toasts.items).toEqual([]);
	});

	it('той самий id — оновлює тост на місці, а не додає новий', () => {
		toast.message('Порядок змінено.', { id: 'order' });
		toast.message('Порядок повернуто.', { id: 'order' });
		expect(toasts.items.map((item) => item.title)).toEqual(['Порядок повернуто.']);
	});

	it('на екрані не більше чотирьох — найстаріший іде першим', () => {
		for (const title of ['1', '2', '3', '4', '5']) toast.info(title);
		expect(toasts.items.map((item) => item.title)).toEqual(['2', '3', '4', '5']);
	});

	it('під курсором час стоїть', () => {
		toast.success('Збережено');
		toasts.pause();
		vi.advanceTimersByTime(60_000);
		expect(toasts.items).toHaveLength(1);
		toasts.resume();
		vi.advanceTimersByTime(4000);
		expect(toasts.items).toEqual([]);
	});

	it('loading висить, поки не закриють', () => {
		const id = toast.loading('Завантаження…');
		vi.advanceTimersByTime(600_000);
		expect(toasts.items).toHaveLength(1);
		toast.dismiss(id);
		expect(toasts.items).toEqual([]);
	});
});
