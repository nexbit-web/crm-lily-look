import { betterAuth } from 'better-auth';
import { authOptions } from './auth-options';
import { prisma } from './db';
import type { Role } from '$lib/permissions';

/**
 * Окремий інстанс better-auth — свідомо без плагіна sveltekitCookies.
 *
 * Реєстрація одразу підписує створеного користувача. На спільному інстансі
 * його Set-Cookie пішов би у відповідь і замінив сесію адміністратора, який
 * заводить акаунт: адмін опинився б у CRM під чужим імʼям. Тут кукі нікуди
 * не потрапляють, бо плагіна, який їх ставить, немає.
 */
const headless = betterAuth(authOptions);

export type CreateStaffResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Заводить співробітника CRM: акаунт better-auth + роль.
 *
 * Пароль сюди приходить у відкритому вигляді лише в межах одного запиту —
 * хешує його better-auth, у базі лишається тільки хеш.
 */
export async function createStaffAccount(input: {
	email: string;
	password: string;
	name: string;
	role: Role;
}): Promise<CreateStaffResult> {
	const response = await headless.api.signUpEmail({
		body: { email: input.email, password: input.password, name: input.name },
		asResponse: true
	});

	if (!response.ok) {
		const body = await response.json().catch(() => null);
		return {
			ok: false,
			message: body?.message ?? `Не вдалося створити акаунт (${response.status})`
		};
	}

	// У role стоїть input: false, тому через API better-auth її не задати —
	// проставляємо окремим запитом одразу після реєстрації.
	const user = await prisma.user.update({
		where: { email: input.email },
		data: { role: input.role },
		select: { id: true }
	});

	// Реєстрація відкрила сесію, кукі від якої ніхто не отримав. Прибираємо:
	// у базі не має лишатись живого входу, якого ніхто не робив.
	await prisma.session.deleteMany({ where: { userId: user.id } });

	return { ok: true, id: user.id };
}
