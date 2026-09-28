import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { funnel } from '$lib/traffic';
import Page from '../src/routes/(app)/traffic/+page.svelte';

/**
 * Сторінка відвідуваності, відрендерена з готовими даними завантажувача:
 * перевіряємо, що кожна цифра з бази доходить до екрана й стоїть на своєму місці.
 */

const COUNTS = { visitors: 100, viewedProduct: 60, added: 12, checkout: 5, ordered: 3 };
const RANGE = { key: '7', from: '2026-09-22', to: '2026-09-28', days: 7 };

const series = Array.from({ length: 7 }, (_, index) => ({
	key: `2026-09-${22 + index}`,
	visitors: index * 2,
	views: index * 3
}));

function ready(overrides: Record<string, unknown> = {}) {
	return {
		state: 'ready',
		range: RANGE,
		source: null,
		today: '2026-09-28',
		crmOrders: 4,
		totals: { visitors: 1234, views: 5678, added: 12, ordered: 3, conversion: 3 },
		series,
		funnel: funnel(COUNTS),
		sources: [
			{
				source: 'facebook',
				visitors: 100,
				added: 12,
				ordered: 3,
				conversion: 3,
				funnel: funnel(COUNTS)
			},
			{
				source: 'direct',
				visitors: 10,
				added: 0,
				ordered: 0,
				conversion: 0,
				funnel: funnel({ visitors: 10, viewedProduct: 0, added: 0, checkout: 0, ordered: 0 })
			}
		],
		products: [
			{
				path: '/product/palto',
				id: 'p1',
				name: 'Пальто беж',
				image: 'https://res.cloudinary.com/demo/image/upload/v1/palto.jpg',
				viewed: 8,
				added: 2,
				rate: 25
			},
			{
				path: '/product/stare',
				id: null,
				name: 'stare',
				image: null,
				viewed: 12,
				added: 0,
				rate: 0
			}
		],
		pages: [
			{ path: '/', label: 'Головна', views: 9, visitors: 8 },
			{ path: '/catalog/palto', label: 'Каталог', views: 1, visitors: 1 }
		],
		exits: [{ page: 'home', label: 'Головна', count: 7, share: 100 }],
		devices: [{ device: 'mobile', label: 'Телефон', visitors: 8, share: 100 }],
		...overrides
	};
}

function html(data: object): string {
	return render(Page, { props: { data } as never }).body;
}

/** Текст сторінки без розмітки й службових коментарів Svelte. */
function text(data: object): string {
	return html(data)
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<[^>]+>/g, ' ')
		// Нерозривні пробіли з toLocaleString('uk-UA') — звичайними.
		.replace(/&nbsp;|\u00a0|\u202f/g, ' ')
		.replace(/\s+/g, ' ');
}

/** Шматок розмітки розділу — від його заголовка до наступного. */
function section(data: object, title: string): string {
	const page = html(data);
	const start = page.indexOf(`>${title}</h2>`);
	expect(start, `розділ «${title}»`).toBeGreaterThan(-1);
	const next = page.indexOf('</h2>', start + title.length + 6);
	return page.slice(start, next === -1 ? undefined : next);
}

describe('сторінка відвідуваності: що бачить людина', () => {
	it('без таблиці чи без даних — «Даних поки немає» і жодного звіту', () => {
		for (const state of ['missing', 'empty']) {
			const page = text({ state, range: RANGE, source: null, today: '2026-09-28' });

			expect(page).toContain('Даних поки немає');
			expect(page).not.toContain('Воронка');
			expect(page).not.toContain('Сторінки');
		}
	});

	it('кнопка оновлення є завжди, навіть коли даних ще немає', () => {
		const page = html({ state: 'empty', range: RANGE, source: null, today: '2026-09-28' });
		expect(page).toContain('aria-label="Оновити дані"');
	});

	it('плитки показують підсумки з бази', () => {
		const page = text(ready());

		expect(page).toContain('Відвідувачі 1 234');
		expect(page).toContain('Перегляди 5 678');
		expect(page).toContain('Додали в кошик 12');
		expect(page).toContain('Замовили 3 у CRM: 4');
		expect(page).toContain('Конверсія 3%');
	});

	it('воронка: пʼять кроків по порядку, кожен зі своєю цифрою', () => {
		// Лише сама воронка: «Замовили 3» є й у плитках над нею.
		const page = text(ready()).split('Воронка')[1].split('Відвідувачі по днях')[0];
		const order = [
			'Зайшли на сайт 100',
			'Дивились товар 60',
			'Додали в кошик 12',
			'Відкрили оформлення 5',
			'Замовили 3'
		].map((step) => page.indexOf(step));

		expect(order.every((index) => index > -1)).toBe(true);
		expect([...order].sort((a, b) => a - b)).toEqual(order);
	});

	it('воронка: переходи між кроками й частка від усіх', () => {
		const funnel = text({ ...ready() }).split('Воронка')[1];

		for (const pass of ['60%', '20%', '42%', '60%']) expect(funnel).toContain(pass);
		expect(funnel).toContain('60% від усіх');
		expect(funnel).toContain('3% від усіх');
	});

	it('найбільший провал воронки червоний, і тільки він', () => {
		const page = section(ready(), 'Воронка');

		expect(page).toMatch(/text-destructive[^"]*"[^>]*>\s*Додали в кошик/);
		expect(page.match(/text-destructive[^"]*"[^>]*>\s*[А-ЯІЇЄ]/g)).toHaveLength(1);
	});

	it('джерела: іконка, назва, конверсія', () => {
		const page = section(ready(), 'Джерела');

		expect(page).toContain('Facebook');
		expect(page).toContain('Напряму');
		expect(page).toContain('#1877f2'); // синя «f» Facebook
		expect(text(ready()).split('Джерела')[1]).toMatch(/Facebook 100 60 60% 12 20%/);
	});

	it('вибране джерело підсвічене в фільтрі', () => {
		const page = html(ready({ source: 'instagram' }));

		expect(page).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?Instagram/);
		expect(page.match(/aria-pressed="true"/g)?.length).toBe(2); // період + джерело
	});

	it('підказка про Facebook Ads — лише коли є трафік з Facebook', () => {
		expect(text(ready())).toContain('Переглядами цільової сторінки');

		const noFacebook = ready({ sources: ready().sources.slice(1) });
		expect(text(noFacebook)).not.toContain('Переглядами цільової сторінки');
	});

	it('сторінки: кожна адреса з переглядами й людьми', () => {
		const page = text(ready()).split('Сторінки')[1];

		expect(page).toContain('Головна / 9 8');
		expect(page).toContain('Каталог /catalog/palto 1 1');
	});

	it('без переглядів розділу «Сторінки» немає, а не порожня рамка', () => {
		expect(text(ready({ pages: [] }))).not.toContain('Сторінки');
	});

	it('товари: посилання на картку, фото й частка додавань', () => {
		const page = section(ready(), 'Товари');

		expect(page).toContain('href="/products/p1"');
		expect(page).toMatch(/<img[^>]+palto\.jpg/);
		expect(text(ready())).toContain('Пальто беж 8 2 25%');
	});

	it('видалений товар — без посилання в нікуди', () => {
		const page = section(ready(), 'Товари');

		expect(page).toContain('stare');
		expect(page.match(/href="\/products\//g)).toHaveLength(1);
	});

	it('товар, який багато дивились і ніхто не взяв, — червоний', () => {
		const page = section(ready(), 'Товари');
		expect(page).toMatch(/text-destructive[^"]*"[^>]*>\s*0%/);
	});

	it('без переглядів товарів — пояснення замість порожньої таблиці', () => {
		expect(text(ready({ products: [] }))).toContain('Товари за цей період не переглядали');
	});

	it('де йдуть і пристрої', () => {
		const page = text(ready());

		expect(page).toMatch(/Де йдуть Головна 100% 7/);
		expect(page).toMatch(/Пристрої .*Телефон 100% 8/);
	});

	it('усі замовили — окреме повідомлення в «Де йдуть»', () => {
		expect(text(ready({ exits: [] }))).toContain('Усі, хто зайшов, замовили');
	});

	it('графік по днях — стовпчик на кожен день, з підказкою', () => {
		const page = section(ready(), 'Відвідувачі по днях');

		expect(page.match(/title="[^"]+ відв\., \d+ перегл\."/g)).toHaveLength(7);
		expect(page).toContain('пік 12');
	});

	it('за один день графіка немає — нема що порівнювати', () => {
		expect(text(ready({ series: series.slice(0, 1) }))).not.toContain('Відвідувачі по днях');
	});

	it('власний період показує вибрані дати', () => {
		const page = html(
			ready({ range: { key: 'custom', from: '2026-09-01', to: '2026-09-10', days: 10 } })
		);

		expect(page).toContain('type="date"');
		expect(page).toContain('max="2026-09-28"');
	});

	it('назви з бази не виконуються як HTML', () => {
		const attack = '<img src=x onerror=alert(1)>';
		const page = html(
			ready({
				products: [{ ...ready().products[0], name: attack }],
				pages: [{ path: `/catalog/${attack}`, label: 'Каталог', views: 1, visitors: 1 }]
			})
		);

		expect(page).not.toContain(attack);
		expect(page).toContain('&lt;img src=x onerror=alert(1)>');
	});
});
