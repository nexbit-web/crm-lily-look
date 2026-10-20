import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import {
	newPassword,
	ROLE_BADGES,
	ROLE_HINTS,
	ROLE_LABELS
} from '../src/routes/(app)/admins/roles';
import { ROLES } from '$lib/permissions';

const db = vi.hoisted(() => ({
	findMany: vi.fn(),
	findUnique: vi.fn(),
	count: vi.fn(),
	update: vi.fn(),
	delete: vi.fn()
}));
const staff = vi.hoisted(() => ({ create: vi.fn() }));
const sessions = vi.hoisted(() => ({ markSessionStale: vi.fn() }));

vi.mock('$lib/server/db', () => ({ prisma: { user: db } }));
vi.mock('$lib/server/staff', () => ({ createStaffAccount: staff.create }));
vi.mock('$lib/server/sessions', () => sessions);

const { load, actions } = await import('../src/routes/(app)/admins/+page.server');

const ADMIN = { user: { id: 'me', role: 'ADMIN' } };
const MANAGER = { user: { id: 'm1', role: 'MANAGER' } };

type Failure = { status: number; data: { message: string } };

function act(name: 'save' | 'delete', fields: Record<string, string>, locals: object = ADMIN) {
	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.set(key, value);
	const request = new Request(`http://localhost/admins?/${name}`, { method: 'POST', body });
	return (actions[name] as unknown as (e: unknown) => Promise<unknown>)({ request, locals });
}

function open(locals: object, isDataRequest = true) {
	return (load as unknown as (e: unknown) => Promise<unknown>)({ locals, isDataRequest });
}

beforeEach(() => {
	for (const mock of Object.values(db)) mock.mockReset();
	staff.create.mockReset().mockResolvedValue({ ok: true, id: 'new' });
	sessions.markSessionStale.mockReset().mockResolvedValue(undefined);
	db.update.mockResolvedValue({});
	db.delete.mockResolvedValue({});
});

describe('співробітники: доступ', () => {
	it('сторінка лише для адміністратора — і перевірка до стріму даних', async () => {
		for (const locals of [MANAGER, { user: { id: 'o', role: 'OPERATOR' } }]) {
			// Перше відкриття (стрім) теж відмовляє одразу, а не скелетоном.
			await expect(open(locals, false)).rejects.toSatisfy(
				(err) => isHttpError(err) && err.status === 403
			);
		}
		expect(db.findMany).not.toHaveBeenCalled();
	});

	it('дії теж закриті — POST руками не допоможе', async () => {
		await expect(act('save', { id: 'u1', role: 'ADMIN' }, MANAGER)).rejects.toSatisfy(
			(err) => isHttpError(err) && err.status === 403
		);
		await expect(act('delete', { id: 'u1' }, MANAGER)).rejects.toSatisfy(isHttpError);
		expect(db.update).not.toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
	});

	it('у браузер — лише потрібні поля, невідома роль стає найменшою', async () => {
		db.findMany.mockResolvedValue([
			{ id: 'me', name: 'Я', email: 'a@b.c', image: null, role: 'ADMIN', createdAt: new Date() },
			{ id: 'x', name: 'Х', email: 'x@b.c', image: null, role: 'GOD', createdAt: new Date() }
		]);

		const data = (await open(ADMIN)) as { meId: string; staff: { role: string }[] };

		expect(data.meId).toBe('me');
		expect(data.staff.map((user) => user.role)).toEqual(['ADMIN', 'OPERATOR']);
		const { select } = db.findMany.mock.calls[0][0];
		expect(Object.keys(select).sort()).toEqual(
			['createdAt', 'email', 'id', 'image', 'name', 'role'].sort()
		);
	});
});

describe('співробітники: зміна ролі', () => {
	it('нова роль записується й діє з наступного ж запиту', async () => {
		db.findUnique.mockResolvedValue({ role: 'MANAGER' });

		expect(await act('save', { id: 'u1', role: 'OPERATOR' })).toEqual({ saved: true });

		expect(db.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { role: 'OPERATOR' } });
		expect(sessions.markSessionStale).toHaveBeenCalledWith('u1');
	});

	it('свою роль змінити не можна', async () => {
		const result = (await act('save', { id: 'me', role: 'OPERATOR' })) as Failure;

		expect(result.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it('останнього адміністратора не понизити', async () => {
		db.findUnique.mockResolvedValue({ role: 'ADMIN' });
		db.count.mockResolvedValue(1);

		const result = (await act('save', { id: 'u1', role: 'MANAGER' })) as Failure;

		expect(result.status).toBe(400);
		expect(result.data.message).toMatch(/останній адміністратор/);
		expect(db.update).not.toHaveBeenCalled();
		expect(sessions.markSessionStale).not.toHaveBeenCalled();
	});

	it('адміністратора понизити можна, якщо є інший', async () => {
		db.findUnique.mockResolvedValue({ role: 'ADMIN' });
		db.count.mockResolvedValue(2);

		expect(await act('save', { id: 'u1', role: 'MANAGER' })).toEqual({ saved: true });
	});

	it('невідома роль чи неіснуючий співробітник — відмова без запису', async () => {
		expect(((await act('save', { id: 'u1', role: 'ROOT' })) as Failure).status).toBe(400);

		db.findUnique.mockResolvedValue(null);
		expect(((await act('save', { id: 'u404', role: 'MANAGER' })) as Failure).status).toBe(404);
		expect(db.update).not.toHaveBeenCalled();
	});
});

describe('співробітники: новий акаунт', () => {
	const valid = { name: 'Оля', email: '  Olya@Lily.UA ', password: 'secret123', role: 'OPERATOR' };

	it('пошта — без пробілів і в нижньому регістрі', async () => {
		db.findUnique.mockResolvedValue(null);

		expect(await act('save', valid)).toEqual({ created: true });
		expect(staff.create).toHaveBeenCalledWith({
			email: 'olya@lily.ua',
			password: 'secret123',
			name: 'Оля',
			role: 'OPERATOR'
		});
	});

	it('порожнє імʼя, крива пошта, короткий пароль — зрозуміла відмова', async () => {
		for (const broken of [
			{ ...valid, name: '  ' },
			{ ...valid, email: 'olya' },
			{ ...valid, password: '1234567' }
		]) {
			expect(((await act('save', broken)) as Failure).status).toBe(400);
		}
		expect(staff.create).not.toHaveBeenCalled();
	});

	it('пошта вже зайнята — відмова', async () => {
		db.findUnique.mockResolvedValue({ id: 'other' });

		const result = (await act('save', valid)) as Failure;
		expect(result.data.message).toMatch(/вже є/);
		expect(staff.create).not.toHaveBeenCalled();
	});

	it('помилка better-auth доходить до форми текстом', async () => {
		db.findUnique.mockResolvedValue(null);
		staff.create.mockResolvedValue({ ok: false, message: 'Password too weak' });

		expect(((await act('save', valid)) as Failure).data.message).toBe('Password too weak');
	});
});

describe('співробітники: видалення', () => {
	it('видаляє й одразу забирає доступ', async () => {
		db.findUnique.mockResolvedValue({ role: 'OPERATOR', name: 'Оля' });

		expect(await act('delete', { id: 'u1' })).toEqual({ deleted: true });
		expect(db.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
		expect(sessions.markSessionStale).toHaveBeenCalledWith('u1');
	});

	it('себе не видалити', async () => {
		expect(((await act('delete', { id: 'me' })) as Failure).status).toBe(400);
		expect(db.delete).not.toHaveBeenCalled();
	});

	it('останнього адміністратора не видалити', async () => {
		db.findUnique.mockResolvedValue({ role: 'ADMIN', name: 'Бос' });
		db.count.mockResolvedValue(1);

		expect(((await act('delete', { id: 'u1' })) as Failure).status).toBe(400);
		expect(db.delete).not.toHaveBeenCalled();
	});

	it('неіснуючого — 404', async () => {
		db.findUnique.mockResolvedValue(null);

		expect(((await act('delete', { id: 'u404' })) as Failure).status).toBe(404);
	});
});

describe('ролі й паролі', () => {
	it('у кожної ролі є назва, підказка й плашка', () => {
		for (const role of ROLES) {
			expect(ROLE_LABELS[role]).toBeTruthy();
			expect(ROLE_HINTS[role]).toBeTruthy();
			expect(ROLE_BADGES[role]).toBeTruthy();
		}
	});

	it('згенерований пароль довгий, без схожих символів і щоразу інший', () => {
		const passwords = Array.from({ length: 50 }, newPassword);

		for (const password of passwords) {
			expect(password).toHaveLength(16);
			expect(password).toMatch(/^[a-zA-Z2-9]+$/);
			expect(password).not.toMatch(/[0O1lI]/);
		}
		expect(new Set(passwords).size).toBe(50);
	});
});
