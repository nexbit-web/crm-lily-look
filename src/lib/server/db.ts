import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from './prisma-client/client';

// Один клієнт на процес. У розробці Vite перезапускає модулі на кожну зміну,
// на Vercel інстанс функції обслуговує запит за запитом — і там, і там новий
// клієнт на кожне звернення відкривав би новий пул зʼєднань Neon, доки ті не
// закінчаться. Тому клієнт живе в globalThis, а не в змінній модуля.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
	if (globalForPrisma.prisma) return globalForPrisma.prisma;

	const connectionString = process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL is not set — додайте connection string з Neon у .env');
	}

	globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
	return globalForPrisma.prisma;
}

/**
 * Клієнт створюється при першому зверненні, а не на імпорті модуля:
 * `vite build` аналізує серверні модулі тоді, коли .env ще не прочитаний,
 * і будь-яке підключення на цьому етапі ламає збірку.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
	get(_target, prop) {
		const instance = client();
		const value = Reflect.get(instance, prop);
		return typeof value === 'function' ? value.bind(instance) : value;
	}
});
