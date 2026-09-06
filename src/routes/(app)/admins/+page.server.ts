import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { createStaffAccount } from '$lib/server/staff';
import { atLeast, isRole, toRole } from '$lib/permissions';
import type { Actions, PageServerLoad } from './$types';

/**
 * Сторінка й кожна її дія — тільки для адміністратора.
 *
 * Перевіряємо на кожному запиті окремо: прихований пункт у сайдбарі захистом
 * не є, POST на ?/create можна надіслати й руками.
 */
function requireAdmin(locals: App.Locals) {
	if (!locals.user) error(401, 'Потрібна авторизація');
	if (!atLeast(locals.user.role, 'ADMIN')) error(403, 'Розділ доступний лише адміністраторам');
	return locals.user;
}

/** Скільки адміністраторів лишиться, якщо чіпати цього. */
function adminCount() {
	return prisma.user.count({ where: { role: 'ADMIN' } });
}

export const load: PageServerLoad = async ({ locals }) => {
	const me = requireAdmin(locals);

	const staff = await prisma.user.findMany({
		orderBy: { createdAt: 'asc' },
		// Явний select, а не весь рядок: хеш пароля живе в Account, але звичка
		// віддавати «все підряд» рано чи пізно щось витягне на клієнт.
		select: { id: true, name: true, email: true, image: true, role: true, createdAt: true }
	});

	return {
		meId: me.id,
		staff: staff.map((user) => ({
			id: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
			role: toRole(user.role),
			createdAt: user.createdAt
		}))
	};
};

export const actions: Actions = {
	/** Одна дія на створення й зміну ролі: різниця лише в наявності id. */
	save: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const form = await request.formData();

		const id = String(form.get('id') ?? '').trim();
		const roleRaw = String(form.get('role') ?? '').trim();
		if (!isRole(roleRaw)) return fail(400, { message: 'Невідома роль' });

		// ── Зміна ролі наявного співробітника ───────────────────────────────
		if (id !== '') {
			if (id === me.id) {
				return fail(400, {
					message: 'Свою роль змінити не можна — попросіть іншого адміністратора'
				});
			}

			const target = await prisma.user.findUnique({
				where: { id },
				select: { role: true }
			});
			if (!target) return fail(404, { message: 'Співробітника не знайдено' });

			// Без жодного адміністратора CRM стає некерованою: цю сторінку
			// більше ніхто не відкриє.
			if (target.role === 'ADMIN' && roleRaw !== 'ADMIN' && (await adminCount()) <= 1) {
				return fail(400, { message: 'Це останній адміністратор — спершу призначте іншого' });
			}

			await prisma.user.update({ where: { id }, data: { role: roleRaw } });
			return { saved: true };
		}

		// ── Новий співробітник ──────────────────────────────────────────────
		const name = String(form.get('name') ?? '').trim();
		const email = String(form.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(form.get('password') ?? '');

		if (name === '') return fail(400, { message: 'Вкажіть імʼя' });
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, { message: 'Перевірте пошту' });
		// Той самий мінімум, що й у authOptions.emailAndPassword.minPasswordLength.
		if (password.length < 8) return fail(400, { message: 'Пароль — щонайменше 8 символів' });

		const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
		if (taken) return fail(400, { message: 'Співробітник із такою поштою вже є' });

		const created = await createStaffAccount({ email, password, name, role: roleRaw });
		if (!created.ok) return fail(400, { message: created.message });

		return { created: true };
	},

	delete: async ({ request, locals }) => {
		const me = requireAdmin(locals);
		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();

		if (id === me.id) {
			return fail(400, { message: 'Свій акаунт видалити не можна' });
		}

		const target = await prisma.user.findUnique({
			where: { id },
			select: { role: true, name: true }
		});
		if (!target) return fail(404, { message: 'Співробітника не знайдено' });

		if (target.role === 'ADMIN' && (await adminCount()) <= 1) {
			return fail(400, { message: 'Це останній адміністратор — спершу призначте іншого' });
		}

		// Сесії й пароль підуть каскадом (onDelete: Cascade на session/account),
		// тому доступ зникає одразу, а не після завершення поточної сесії.
		await prisma.user.delete({ where: { id } });
		return { deleted: true };
	}
};
