import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const db = vi.hoisted(() => ({
	userFindMany: vi.fn(),
	userFindUnique: vi.fn(),
	userUpdate: vi.fn(),
	userCount: vi.fn(),
	inviteFindMany: vi.fn(),
	inviteCreate: vi.fn(),
	inviteUpdateMany: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	prisma: {
		botUser: {
			findMany: db.userFindMany,
			findUnique: db.userFindUnique,
			update: db.userUpdate,
			count: db.userCount
		},
		botInvite: {
			findMany: db.inviteFindMany,
			create: db.inviteCreate,
			updateMany: db.inviteUpdateMany
		}
	}
}));

const { load, actions } = await import('../src/routes/(app)/telegram/+page.server');

type Staff = { id: string; telegramId: string; role: string; isActive: boolean };
type Result = { staff: Staff[]; invites: unknown[]; activeAdmins: number };

const ADMIN = { id: 'crm-1', role: 'ADMIN' };

function person(over: Partial<Record<string, unknown>> = {}) {
	return {
		id: 'b1',
		telegramId: 6141441397n,
		name: 'Микита',
		username: null,
		role: 'ADMIN',
		isActive: true,
		leftAt: null,
		createdAt: new Date('2026-09-23T11:31:48Z'),
		...over
	};
}

function open(role: string | null) {
	return (load as unknown as (e: unknown) => Promise<Result>)({
		locals: { user: role === null ? null : { id: 'crm-1', role } }
	});
}

function act(name: keyof typeof actions, fields: Record<string, string>, role = 'ADMIN') {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) form.set(key, value);

	const handler = actions[name] as unknown as (e: unknown) => Promise<unknown>;
	return handler({
		locals: { user: { ...ADMIN, role } },
		request: { formData: async () => form }
	});
}

describe('сторінка Telegram-бота', () => {
	beforeEach(() => {
		for (const mock of Object.values(db)) mock.mockReset();
		db.userFindMany.mockResolvedValue([]);
		db.inviteFindMany.mockResolvedValue([]);
		db.userCount.mockResolvedValue(0);
		db.userUpdate.mockResolvedValue({ id: 'b1' });
		db.inviteCreate.mockResolvedValue({ id: 'i1' });
		db.inviteUpdateMany.mockResolvedValue({ count: 1 });
	});

	describe('доступ до розділу', () => {
		it('пускає лише адміністраторів CRM', async () => {
			// Тут видаються ключі від бота — менеджеру тут робити нічого.
			for (const role of [null, 'OPERATOR', 'MANAGER', 'admin', '']) {
				await expect(open(role)).rejects.toSatisfy(isHttpError);
			}
			expect(db.userFindMany).not.toHaveBeenCalled();
		});

		it('адміністратора пускає', async () => {
			await expect(open('ADMIN')).resolves.toBeTruthy();
		});

		it('дії теж закриті від менеджера', async () => {
			await expect(act('invite', { role: 'MANAGER' }, 'MANAGER')).rejects.toSatisfy(isHttpError);
			expect(db.inviteCreate).not.toHaveBeenCalled();
		});
	});

	describe('що отримує сторінка', () => {
		it('telegramId віддається рядком — Number його вже не тримає', async () => {
			db.userFindMany.mockResolvedValue([person()]);

			const data = await open('ADMIN');

			expect(data.staff[0].telegramId).toBe('6141441397');
			// Саме той випадок, від якого застерігає документація бота.
			expect(Number(data.staff[0].telegramId)).not.toBe(6141441397.5);
		});

		it('спершу показує тих, хто працює', async () => {
			db.userFindMany.mockResolvedValue([
				person({ id: 'off', isActive: false, createdAt: new Date('2026-01-01') }),
				person({ id: 'on', createdAt: new Date('2026-05-05') })
			]);

			const data = await open('ADMIN');

			expect(data.staff.map((row) => row.id)).toEqual(['on', 'off']);
		});

		it('рахує адміністраторів із доступом, а не всіх поспіль', async () => {
			db.userFindMany.mockResolvedValue([
				person({ id: 'a1' }),
				person({ id: 'a2', isActive: false }),
				person({ id: 'a3', leftAt: new Date() }),
				person({ id: 'm1', role: 'MANAGER' })
			]);

			expect((await open('ADMIN')).activeAdmins).toBe(1);
		});
	});

	describe('коди', () => {
		it('створює код із роллю й терміном', async () => {
			const result = (await act('invite', { role: 'COURIER', note: 'Олена', term: '7' })) as {
				code: string;
			};

			expect(result.code).toMatch(/^LILY-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);

			const data = db.inviteCreate.mock.calls[0][0].data;
			expect(data.role).toBe('COURIER');
			expect(data.note).toBe('Олена');
			expect(data.expiresAt).toBeInstanceOf(Date);
		});

		it('порожній термін — безстроковий код', async () => {
			await act('invite', { role: 'MANAGER', term: '' });
			expect(db.inviteCreate.mock.calls[0][0].data.expiresAt).toBeNull();
		});

		it('невідома роль і дикий термін не проходять', async () => {
			const bad: Record<string, string>[] = [{ role: 'OWNER' }, { role: 'MANAGER', term: '9999' }];

			for (const fields of bad) {
				const result = (await act('invite', fields)) as { status: number };
				expect(result.status).toBe(400);
			}
			expect(db.inviteCreate).not.toHaveBeenCalled();
		});

		it('відкликає лише невикористаний код', async () => {
			await act('revokeInvite', { id: 'i1' });

			// Умова usedAt: null — захист від гонки: якщо людина встигла увійти,
			// ми не затремо позначку бота.
			expect(db.inviteUpdateMany.mock.calls[0][0].where).toEqual({ id: 'i1', usedAt: null });
		});

		it('уже використаний код дає зрозумілу відмову', async () => {
			db.inviteUpdateMany.mockResolvedValue({ count: 0 });

			const result = (await act('revokeInvite', { id: 'i1' })) as { status: number };
			expect(result.status).toBe(409);
		});
	});

	describe('доступ людини', () => {
		it('повернення доступу знімає й позначку виходу', async () => {
			// Найчастіша помилка на цьому екрані: увімкнули isActive, а бот усе
			// одно не пускає, бо лишився leftAt.
			db.userFindUnique.mockResolvedValue({
				role: 'MANAGER',
				isActive: false,
				leftAt: new Date()
			});

			await act('access', { id: 'b1', grant: 'on' });

			expect(db.userUpdate.mock.calls[0][0].data).toEqual({ isActive: true, leftAt: null });
		});

		it('відкликання не чіпає leftAt', async () => {
			db.userFindUnique.mockResolvedValue({ role: 'MANAGER', isActive: true, leftAt: null });

			await act('access', { id: 'b1' });

			expect(db.userUpdate.mock.calls[0][0].data).toEqual({ isActive: false });
		});

		it('останнього адміністратора вимкнути не дає', async () => {
			db.userFindUnique.mockResolvedValue({ role: 'ADMIN', isActive: true, leftAt: null });
			db.userCount.mockResolvedValue(0);

			const result = (await act('access', { id: 'b1' })) as { status: number };

			expect(result.status).toBe(409);
			expect(db.userUpdate).not.toHaveBeenCalled();
		});

		it('якщо адміністратор не один — вимикає', async () => {
			db.userFindUnique.mockResolvedValue({ role: 'ADMIN', isActive: true, leftAt: null });
			db.userCount.mockResolvedValue(1);

			await act('access', { id: 'b1' });

			expect(db.userUpdate).toHaveBeenCalled();
		});

		it('останнього адміністратора не можна й понизити роллю', async () => {
			db.userFindUnique.mockResolvedValue({ role: 'ADMIN', isActive: true, leftAt: null });
			db.userCount.mockResolvedValue(0);

			const result = (await act('role', { id: 'b1', role: 'MANAGER' })) as { status: number };

			expect(result.status).toBe(409);
			expect(db.userUpdate).not.toHaveBeenCalled();
		});

		it('роль вимкненого адміністратора міняти можна', async () => {
			// Він і так без доступу, останнім активним не рахується.
			db.userFindUnique.mockResolvedValue({ role: 'ADMIN', isActive: false, leftAt: null });
			db.userCount.mockResolvedValue(0);

			await act('role', { id: 'b1', role: 'MANAGER' });

			expect(db.userUpdate.mock.calls[0][0].data).toEqual({ role: 'MANAGER' });
		});
	});
});
