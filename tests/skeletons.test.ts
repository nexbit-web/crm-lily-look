import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import RouteSkeleton, {
	hasSkeleton,
	TABLES
} from '$lib/components/skeletons/route-skeleton.svelte';
import DeferredHarness from './helpers/deferred-harness.svelte';

/** Файл сторінки, де живе справжня таблиця розділу. */
const VIEWS: Record<string, string> = {
	'/orders': 'orders/orders-view.svelte',
	'/products': 'products/products-view.svelte',
	'/categories': 'categories/categories-view.svelte',
	'/discounts': 'discounts/discounts-view.svelte',
	'/admins': 'admins/admins-view.svelte',
	'/telegram': 'telegram/telegram-view.svelte'
};

const view = (section: string) =>
	readFileSync(new URL(`../src/routes/(app)/${VIEWS[section]}`, import.meta.url), 'utf8');

/** Скільки колонок у grid-cols-[…]: доріжки розділені «_» поза дужками. */
function tracks(columns: string): number {
	const inner = columns.slice('grid-cols-['.length, -1);
	let depth = 0;
	let count = 1;
	for (const char of inner) {
		if (char === '(') depth += 1;
		if (char === ')') depth -= 1;
		if (char === '_' && depth === 0) count += 1;
	}
	return count;
}

describe('скелетони сторінок', () => {
	it('є для кожного розділу з даними, але не для налаштувань і входу', () => {
		for (const path of [
			'/orders',
			'/products',
			'/products/new',
			'/products/abc',
			'/categories',
			'/discounts',
			'/statistics',
			'/traffic',
			'/admins',
			'/telegram'
		]) {
			expect(hasSkeleton(path), path).toBe(true);
		}
		for (const path of ['/', '/settings', '/login', '/ordersx', '/api/search']) {
			expect(hasSkeleton(path), path).toBe(false);
		}
	});

	it('сітка скелетона — та сама, що в таблиці сторінки: дані лягають без стрибка', () => {
		expect(Object.keys(TABLES).sort()).toEqual(Object.keys(VIEWS).sort());
		for (const [section, table] of Object.entries(TABLES)) {
			expect(view(section), section).toContain(table.columns);
		}
	});

	it('по клітинці на кожну колонку', () => {
		for (const [section, table] of Object.entries(TABLES)) {
			expect(table.cells, section).toHaveLength(tracks(table.columns));
		}
	});

	it('кожен скелетон позначений як завантаження й має сітку своєї таблиці', () => {
		for (const [section, table] of Object.entries(TABLES)) {
			const { body } = render(RouteSkeleton, { props: { path: section } });
			expect(body, section).toContain('aria-busy="true"');
			expect(body, section).toContain(table.columns);
		}
	});

	it('картка товару, статистика й відвідуваність — свої скелетони, не таблиця', () => {
		for (const path of ['/products/new', '/products/abc', '/statistics', '/traffic']) {
			const { body } = render(RouteSkeleton, { props: { path } });
			expect(body, path).toContain('skeleton');
			expect(body, path).not.toContain(TABLES['/products'].columns);
		}
	});

	it('для сторінки без скелетона — нічого', () => {
		const { body } = render(RouteSkeleton, { props: { path: '/settings' } });
		expect(body).not.toContain('skeleton');
	});
});

describe('Deferred: дані або скелетон', () => {
	it('готові дані (перехід, «Зберегти») — одразу сторінка, без скелетона', () => {
		const { body } = render(DeferredHarness, { props: { value: { n: 1 } } });

		expect(body).toContain('дані: {"n":1}');
		expect(body).not.toContain('скелетон');
	});

	it('дані ще в дорозі (перше відкриття) — скелетон', () => {
		const { body } = render(DeferredHarness, { props: { value: new Promise(() => {}) } });

		expect(body).toContain('скелетон');
		expect(body).not.toContain('дані:');
	});
});
