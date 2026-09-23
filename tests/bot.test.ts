import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accessState, inviteState, isBotRole, startCommand } from '$lib/bot';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('$lib/server/db', () => ({ prisma: { botInvite: { create } } }));

const { createInvite, randomInviteCode } = await import('$lib/server/bot-invite');

describe('стан коду доступу', () => {
	const now = new Date('2026-09-23T12:00:00Z');

	it('використаний важливіший за прострочений', () => {
		// Бот проставив usedAt — отже людина вже увійшла, навіть якщо термін
		// відтоді минув. Показувати це як «прострочений» було б неправдою.
		expect(
			inviteState({ usedAt: new Date('2026-09-01'), expiresAt: new Date('2026-09-02') }, now)
		).toBe('used');
	});

	it('термін у минулому — прострочений', () => {
		expect(inviteState({ usedAt: null, expiresAt: new Date('2026-09-22') }, now)).toBe('expired');
	});

	it('без терміну код чекає вічно', () => {
		expect(inviteState({ usedAt: null, expiresAt: null }, now)).toBe('waiting');
	});
});

describe('стан доступу', () => {
	it('доступ дає тільки isActive разом із порожнім leftAt', () => {
		expect(accessState({ isActive: true, leftAt: null })).toBe('active');
		expect(accessState({ isActive: false, leftAt: null })).toBe('revoked');
		expect(accessState({ isActive: false, leftAt: new Date() })).toBe('left');
	});

	it('увімкнений isActive не перекриває виходу', () => {
		// Саме тут ламаються: людині вмикають доступ, а бот не пускає, бо
		// leftAt лишився. На екрані такий рядок мусить лишатись «вийшов сам».
		expect(accessState({ isActive: true, leftAt: new Date() })).toBe('left');
	});
});

describe('ролі бота', () => {
	it('не приймає схожі рядки', () => {
		expect(isBotRole('ADMIN')).toBe(true);
		expect(isBotRole('Admin')).toBe(false);
		expect(isBotRole('OPERATOR')).toBe(false);
	});
});

describe('команда для людини', () => {
	it('копіюється цілим рядком, а не самим кодом', () => {
		expect(startCommand('LILY-7K2M4P')).toBe('/start LILY-7K2M4P');
	});
});

describe('генерація коду', () => {
	beforeEach(() => {
		create.mockReset();
		create.mockResolvedValue({ id: 'i1' });
	});

	it('верхній регістр, без схожих символів', () => {
		// Код диктують телефоном: 0/O та 1/I в алфавіті немає.
		for (let i = 0; i < 200; i += 1) {
			expect(randomInviteCode()).toMatch(/^LILY-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
		}
	});

	it('не повторюється', () => {
		const codes = new Set(Array.from({ length: 500 }, () => randomInviteCode()));
		expect(codes.size).toBe(500);
	});

	it('на збіг із наявним пробує ще раз, а не показує помилку бази', () => {
		create.mockRejectedValueOnce({ code: 'P2002' });

		return createInvite({ role: 'MANAGER', note: null, expiresAt: null }).then((result) => {
			expect(create).toHaveBeenCalledTimes(2);
			expect(result.code).toMatch(/^LILY-/);
		});
	});

	it('інші помилки бази не ковтає', async () => {
		create.mockRejectedValue({ code: 'P1001' });

		await expect(createInvite({ role: 'MANAGER', note: null, expiresAt: null })).rejects.toEqual({
			code: 'P1001'
		});
		expect(create).toHaveBeenCalledTimes(1);
	});
});
