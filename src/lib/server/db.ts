import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from './prisma-client/client';

// Vite перезапускає модулі на кожну зміну, тому в дев-режимі тримаємо один
// клієнт на процес, інакше пул з'єднань Neon швидко закінчується.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
	if (globalForPrisma.prisma) return globalForPrisma.prisma;

	const connectionString = process.env.DATABASE_URL;

	if (!connectionString) {
		throw new Error('DATABASE_URL is not set — додайте connection string з Neon у .env');
	}

	const instance = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
	if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = instance;
	return instance;
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
