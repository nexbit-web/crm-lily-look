import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created = vi.hoisted(() => ({ clients: 0, pools: [] as string[] }));

vi.mock('@prisma/adapter-neon', () => ({
	PrismaNeon: class {
		constructor({ connectionString }: { connectionString: string }) {
			created.pools.push(connectionString);
		}
	}
}));

vi.mock('$lib/server/prisma-client/client', () => ({
	PrismaClient: class {
		user = { count: async () => 1 };
		constructor() {
			created.clients += 1;
		}
		$queryRaw() {
			return this;
		}
	}
}));

const globals = globalThis as { prisma?: unknown };

async function fresh() {
	vi.resetModules();
	return import('$lib/server/db');
}

beforeEach(() => {
	created.clients = 0;
	created.pools = [];
	delete globals.prisma;
	vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@ep-test-pooler.eu-central-1.aws.neon.tech/db');
});

afterEach(() => {
	delete globals.prisma;
	vi.unstubAllEnvs();
});

describe('підключення до бази', () => {
	it('імпорт модуля нікуди не підключається — збірка проходить без .env', async () => {
		vi.stubEnv('DATABASE_URL', '');
		await fresh();

		expect(created.clients).toBe(0);
	});

	it('у продакшені — один клієнт і один пул на процес, а не на кожен запит', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		const { prisma } = await fresh();

		await prisma.user.count();
		await prisma.user.count();
		expect(prisma.$queryRaw``).toBeDefined();

		expect(created.clients).toBe(1);
		expect(created.pools).toHaveLength(1);
	});

	it('у розробці клієнт переживає перезапуск модуля Vite', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		const first = await fresh();
		await first.prisma.user.count();
		const second = await fresh();
		await second.prisma.user.count();

		expect(created.clients).toBe(1);
	});

	it('методи клієнта працюють і через проксі (this на місці)', async () => {
		const { prisma } = await fresh();

		expect(prisma.$queryRaw``).toBe(globals.prisma);
	});

	it('без DATABASE_URL — зрозуміла помилка при першому запиті', async () => {
		vi.stubEnv('DATABASE_URL', '');
		const { prisma } = await fresh();

		expect(() => prisma.user).toThrow(/DATABASE_URL/);
	});
});
