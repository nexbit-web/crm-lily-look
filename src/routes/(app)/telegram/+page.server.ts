import { error, fail } from '@sveltejs/kit';
import { prisma } from '$lib/server/db';
import { createInvite } from '$lib/server/bot-invite';
import { atLeast } from '$lib/permissions';
import { accessState, isBotRole, type BotRoleKey } from '$lib/bot';
import type { Actions, PageServerLoad } from './$types';

/** Скільки останніх кодів показуємо: історія тут довідкова. */
const INVITES_SHOWN = 30;

/** Видача доступу до бота — справа власника, не менеджера. */
function requireAdmin(locals: App.Locals) {
	if (!atLeast(locals.user?.role, 'ADMIN')) {
		error(403, 'Розділ доступний лише адміністраторам');
	}
}

/**
 * telegramId і chatId у базі — bigint: id Telegram уже впритул підходять до
 * межі Number у JS. Назовні віддаємо рядком, щоб ніде не втратити точність.
 */
function idToString(value: bigint): string {
	return value.toString();
}

export const load: PageServerLoad = async ({ locals }) => {
	requireAdmin(locals);

	const [users, invites] = await Promise.all([
		prisma.botUser.findMany({
			select: {
				id: true,
				telegramId: true,
				name: true,
				username: true,
				role: true,
				isActive: true,
				leftAt: true,
				createdAt: true
			}
		}),
		prisma.botInvite.findMany({
			orderBy: { createdAt: 'desc' },
			take: INVITES_SHOWN,
			select: {
				id: true,
				code: true,
				role: true,
				note: true,
				expiresAt: true,
				usedAt: true,
				createdAt: true,
				usedBy: { select: { name: true, username: true } }
			}
		})
	]);

	// Порядок із документації бота: спершу ті, хто працює, далі за датою
	// приєднання. Prisma не сортує за виразом, а список тут на десяток рядків.
	const staff = users
		.map((user) => ({ ...user, telegramId: idToString(user.telegramId) }))
		.sort((a, b) => {
			const byAccess = Number(accessState(b) === 'active') - Number(accessState(a) === 'active');
			return byAccess || a.createdAt.getTime() - b.createdAt.getTime();
		});

	return {
		staff,
		invites,
		/** Скільки адміністраторів зараз при доступі — щоб не вимкнути останнього. */
		activeAdmins: staff.filter((user) => user.role === 'ADMIN' && accessState(user) === 'active')
			.length
	};
};

/**
 * Чи лишиться хоч один адміністратор із доступом, якщо прибрати цього.
 *
 * Коди видає тільки адмін і тільки зсередини бота. Вимкнути останнього —
 * означає, що видавати нові коди стане нікому: лишиться хіба вписувати рядок
 * у BotInvite руками.
 */
async function hasOtherActiveAdmin(exceptId: string): Promise<boolean> {
	const count = await prisma.botUser.count({
		where: { id: { not: exceptId }, role: 'ADMIN', isActive: true, leftAt: null }
	});
	return count > 0;
}

function formRole(form: FormData): BotRoleKey | null {
	const value = String(form.get('role') ?? '');
	return isBotRole(value) ? value : null;
}

export const actions: Actions = {
	/** Новий код доступу. Telegram id наперед не потрібен — людина принесе його сама. */
	invite: async ({ request, locals }) => {
		requireAdmin(locals);

		const form = await request.formData();
		const role = formRole(form);
		const note = String(form.get('note') ?? '').trim();
		const termRaw = String(form.get('term') ?? '').trim();

		if (!role) return fail(400, { message: 'Виберіть роль' });

		// Порожній термін — безстроковий код.
		const days = termRaw === '' ? null : Number(termRaw);
		if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) {
			return fail(400, { message: 'Термін дії — від 1 до 365 днів' });
		}

		const expiresAt = days === null ? null : new Date(Date.now() + days * 86_400_000);

		try {
			const { code } = await createInvite({ role, note: note || null, expiresAt });
			return { code };
		} catch (err) {
			return fail(500, { message: err instanceof Error ? err.message : 'Не вдалося створити код' });
		}
	},

	/**
	 * Відкликати ще не виданий код. Не видаляємо, а гасимо — у списку лишається
	 * слід. Умова `usedAt: null` захищає від гонки: якщо людина встигла увійти
	 * між показом сторінки й натисканням, ми не затремо позначку бота.
	 */
	revokeInvite: async ({ request, locals }) => {
		requireAdmin(locals);

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		if (!id) return fail(400, { message: 'Не вказано код' });

		const { count } = await prisma.botInvite.updateMany({
			where: { id, usedAt: null },
			data: { usedAt: new Date() }
		});

		if (count === 0) return fail(409, { message: 'Код уже використали — відкликати нічого' });

		return { revoked: true };
	},

	/** Роль підхопиться на наступній дії людини в боті. */
	role: async ({ request, locals }) => {
		requireAdmin(locals);

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const role = formRole(form);

		if (!id || !role) return fail(400, { message: 'Невідома роль' });

		const target = await prisma.botUser.findUnique({
			where: { id },
			select: { role: true, isActive: true, leftAt: true }
		});
		if (!target) return fail(404, { message: 'Людину не знайдено' });

		const losesLastAdmin =
			target.role === 'ADMIN' && role !== 'ADMIN' && accessState(target) === 'active';
		if (losesLastAdmin && !(await hasOtherActiveAdmin(id))) {
			return fail(409, { message: 'Це останній адміністратор — спершу призначте ще одного' });
		}

		await prisma.botUser.update({ where: { id }, data: { role }, select: { id: true } });

		return { saved: true };
	},

	/**
	 * Відкликати або повернути доступ.
	 *
	 * Повернення завжди знімає й `leftAt`: людині, яка вийшла сама, самого
	 * `isActive` замало — бот перевіряє обидві умови. Це найчастіша помилка на
	 * цьому екрані, тому вона тут неможлива за побудовою.
	 */
	access: async ({ request, locals }) => {
		requireAdmin(locals);

		const form = await request.formData();
		const id = String(form.get('id') ?? '').trim();
		const grant = form.get('grant') === 'on';

		if (!id) return fail(400, { message: 'Не вказано людину' });

		const target = await prisma.botUser.findUnique({
			where: { id },
			select: { role: true, isActive: true, leftAt: true }
		});
		if (!target) return fail(404, { message: 'Людину не знайдено' });

		if (!grant && target.role === 'ADMIN' && !(await hasOtherActiveAdmin(id))) {
			return fail(409, { message: 'Не вимикайте останнього адміністратора' });
		}

		await prisma.botUser.update({
			where: { id },
			data: grant ? { isActive: true, leftAt: null } : { isActive: false },
			select: { id: true }
		});

		return { saved: true };
	}
};
