import type { BetterAuthOptions } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db';

/**
 * Налаштування better-auth без SvelteKit-специфічних плагінів.
 *
 * Вивільнено в окремий файл, щоб `@better-auth/cli generate` міг імпортувати
 * конфіг поза Vite (плагін sveltekitCookies тягне `$app/server`, який існує
 * лише всередині SvelteKit).
 */
export const authOptions = {
	appName: 'CRM LILY LOOK',
	database: prismaAdapter(prisma, { provider: 'postgresql' }),
	secret: process.env.BETTER_AUTH_SECRET,
	// Без значення better-auth бере origin із самого запиту — інакше dev-сервер,
	// що стартував на іншому порті, віддавав би 404 на /api/auth/*.
	// У продакшені BETTER_AUTH_URL треба задати явно.
	baseURL: process.env.BETTER_AUTH_URL,

	// CRM закритий: акаунти створює адміністратор, публічної реєстрації немає.
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: false,
		minPasswordLength: 8
	},

	session: {
		expiresIn: 60 * 60 * 24 * 7, // тиждень
		updateAge: 60 * 60 * 24, // подовжувати сесію не частіше разу на добу
		cookieCache: { enabled: true, maxAge: 60 * 5 }
	},

	user: {
		additionalFields: {
			role: {
				type: 'string',
				required: false,
				defaultValue: 'MANAGER',
				input: false // роль не можна підмінити з клієнта
			}
		}
	}
} satisfies BetterAuthOptions;
