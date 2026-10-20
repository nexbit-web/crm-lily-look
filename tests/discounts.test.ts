import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPercent, isFractional, parsePercent } from '$lib/percent';

const db = vi.hoisted(() => ({
	queryRaw: vi.fn(),
	findMany: vi.fn(),
	findUnique: vi.fn(),
	create: vi.fn(),
	update: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	prisma: {
		$queryRaw: db.queryRaw,
		discount: {
			findMany: db.findMany,
			findUnique: db.findUnique,
			create: db.create,
			update: db.update
		},
		product: { findMany: vi.fn(async () => []) },
		category: { findMany: vi.fn(async () => []) }
	}
}));

vi.mock('$lib/server/categories', () => ({ categoryOptions: vi.fn(async () => []) }));

/** Знижки ведуть менеджери й адміністратори. */
const ADMIN = { user: { id: 'u1', role: 'ADMIN' } };

type Result = { status?: number; data?: { message: string } } | { saved: true };

/** Свіжий модуль на кожен тест: кеш «колонка вже дробова» не перетікає. */
async function page() {
	vi.resetModules();
	return import('../src/routes/(app)/discounts/+page.server');
}

async function save(value: string, id = ''): Promise<Result> {
	const { actions } = await page();
	const form = new FormData();
	form.set('id', id);
	form.set('name', 'Осінь');
	form.set('kind', 'percent');
	form.set('value', value);
	form.set('scope', 'ALL');
	form.set('isActive', 'on');
	const request = new Request('http://localhost/discounts?/save', { method: 'POST', body: form });
	return (actions.save as unknown as (e: unknown) => Promise<Result>)({ request, locals: ADMIN });
}

/** Тип колонки в базі: 0 знаків після коми — ще integer, 2 — вже numeric(5,2). */
const column = (scale: number) => db.queryRaw.mockResolvedValue([{ scale }]);

describe('відсоток знижки: розбір', () => {
	it('приймає дроби через крапку й кому', () => {
		expect(parsePercent('33.6')).toBe('33.6');
		expect(parsePercent('33,6')).toBe('33.6');
		expect(parsePercent('12.25')).toBe('12.25');
		expect(parsePercent(' 20 ')).toBe('20');
		expect(parsePercent('20%')).toBe('20');
	});

	it('зайві нулі прибирає', () => {
		expect(parsePercent('07.50')).toBe('7.5');
		expect(parsePercent('33.0')).toBe('33');
	});

	it('межі 1..90 — як CHECK у базі', () => {
		expect(parsePercent('1')).toBe('1');
		expect(parsePercent('90')).toBe('90');
		for (const bad of ['0.99', '0', '90.01', '91', '100']) expect(parsePercent(bad)).toBeNull();
	});

	it('не більше двох знаків після коми — стільки тримає колонка', () => {
		expect(parsePercent('33.333')).toBeNull();
	});

	it('сміття — не відсоток', () => {
		for (const bad of ['', 'abc', '-5', '1e1', '33..6', '3 3', '33.6.1', 'NaN', 'Infinity']) {
			expect(parsePercent(bad), bad).toBeNull();
		}
	});

	it('дріб від цілого відрізняє', () => {
		expect(isFractional('33.6')).toBe(true);
		expect(isFractional('33')).toBe(false);
	});

	it('показує українською комою й без зайвих нулів', () => {
		expect(formatPercent(33.6)).toBe('33,6');
		expect(formatPercent(12.25)).toBe('12,25');
		expect(formatPercent(20)).toBe('20');
	});
});

describe('сторінка знижок', () => {
	beforeEach(() => {
		for (const fn of Object.values(db)) fn.mockReset();
		db.create.mockResolvedValue({});
	});

	it('дробовий відсоток записується в базу рядком — без похибки float', async () => {
		column(2);
		expect(await save('33,6')).toEqual({ saved: true });

		expect(db.create.mock.calls[0][0].data).toMatchObject({ percent: '33.6', amount: null });
	});

	it('поки колонка ціла, дріб не записується — база б округлила 33.6 до 34', async () => {
		column(0);
		const result = await save('33.6');

		expect(result).toMatchObject({ status: 400 });
		expect(db.create).not.toHaveBeenCalled();
	});

	it('цілий відсоток зберігається без жодної перевірки колонки', async () => {
		expect(await save('20')).toEqual({ saved: true });

		expect(db.queryRaw).not.toHaveBeenCalled();
		expect(db.create.mock.calls[0][0].data).toMatchObject({ percent: '20' });
	});

	it('колонку перевіряє один раз — далі без зайвого запиту', async () => {
		column(2);
		const { actions } = await page();
		const run = (value: string) => {
			const form = new FormData();
			form.set('name', 'Осінь');
			form.set('kind', 'percent');
			form.set('value', value);
			form.set('scope', 'ALL');
			const request = new Request('http://localhost/discounts?/save', {
				method: 'POST',
				body: form
			});
			return (actions.save as unknown as (e: unknown) => Promise<Result>)({
				request,
				locals: ADMIN
			});
		};

		await run('33.6');
		await run('12.5');

		expect(db.queryRaw).toHaveBeenCalledTimes(1);
		expect(db.create).toHaveBeenCalledTimes(2);
	});

	it('неправильний відсоток — зрозуміла помилка, а не запис', async () => {
		for (const bad of ['95', '0.5', '33.333', 'abc']) {
			expect(await save(bad)).toMatchObject({ status: 400 });
		}
		expect(db.create).not.toHaveBeenCalled();
	});

	it('на сторінку відсоток іде звичайним числом, а не Decimal', async () => {
		// Так виглядає Decimal з Prisma: valueOf віддає рядок.
		const decimal = { valueOf: () => '33.6', toString: () => '33.6' };
		db.findMany.mockResolvedValue([
			{
				id: 'd1',
				name: 'Осінь',
				scope: 'ALL',
				percent: decimal,
				amount: null,
				isActive: true,
				categories: [],
				products: []
			}
		]);

		const { load } = await page();
		const data = (
			await (load as unknown as (e: unknown) => Promise<{ discounts: { percent: unknown }[] }>)({
				locals: ADMIN
			})
		).discounts;

		expect(data[0].percent).toBe(33.6);
	});
});

describe('доступ до знижок', () => {
	beforeEach(() => db.findMany.mockReset().mockResolvedValue([]));

	const open = async (role: string | null) => {
		const { load } = await page();
		return (load as unknown as (e: unknown) => Promise<unknown>)({
			locals: role ? { user: { id: 'u1', role } } : {}
		});
	};

	it('менеджера й адміністратора пускає', async () => {
		await expect(open('MANAGER')).resolves.toMatchObject({ discounts: [] });
		await expect(open('ADMIN')).resolves.toMatchObject({ discounts: [] });
	});

	it('оператора й гостя — 403', async () => {
		await expect(open('OPERATOR')).rejects.toMatchObject({ status: 403 });
		await expect(open(null)).rejects.toMatchObject({ status: 403 });
	});
});

describe('перемикач знижки в списку', () => {
	beforeEach(() => {
		db.findUnique.mockReset();
		db.update.mockReset().mockResolvedValue({});
	});

	const toggle = async (id: string, locals: object = ADMIN) => {
		const { actions } = await page();
		const body = new FormData();
		body.set('id', id);
		const request = new Request('http://localhost/discounts?/toggle', { method: 'POST', body });
		return (actions.toggle as unknown as (e: unknown) => Promise<unknown>)({ request, locals });
	};

	it('вмикає вимкнену й вимикає увімкнену — за станом у базі, а не з браузера', async () => {
		db.findUnique.mockResolvedValueOnce({ isActive: false });
		expect(await toggle('d1')).toEqual({ toggled: true });
		expect(db.update).toHaveBeenLastCalledWith({ where: { id: 'd1' }, data: { isActive: true } });

		db.findUnique.mockResolvedValueOnce({ isActive: true });
		await toggle('d1');
		expect(db.update).toHaveBeenLastCalledWith({ where: { id: 'd1' }, data: { isActive: false } });
	});

	it('«Скасувати» в тості — той самий перемикач ще раз, тож стан повертається', async () => {
		let active = true;
		db.findUnique.mockImplementation(async () => ({ isActive: active }));
		db.update.mockImplementation(async ({ data }: { data: { isActive: boolean } }) => {
			active = data.isActive;
		});

		await toggle('d1');
		await toggle('d1');
		expect(active).toBe(true);
	});

	it('знижки вже немає — 404, нічого не пишемо', async () => {
		db.findUnique.mockResolvedValue(null);

		expect(await toggle('gone')).toMatchObject({ status: 404 });
		expect(db.update).not.toHaveBeenCalled();
	});

	it('оператор перемкнути не може', async () => {
		await expect(toggle('d1', { user: { id: 'o', role: 'OPERATOR' } })).rejects.toMatchObject({
			status: 403
		});
		expect(db.update).not.toHaveBeenCalled();
	});
});
