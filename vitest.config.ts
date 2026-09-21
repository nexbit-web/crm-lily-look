import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Тести ганяємо без плагіна SvelteKit: усе, що перевіряється, — це .ts-модулі
 * й серверні завантажувачі, а сам плагін тягнув би за собою повну збірку й
 * згенерований клієнт Prisma (його немає в репозиторії).
 *
 * Тому тут лише аліаси, які інакше дає SvelteKit.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$app/environment': fileURLToPath(new URL('./tests/stubs/app-environment.ts', import.meta.url))
		}
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Кожен тест починає з чистими шпигунами — інакше лічильники викликів
		// перетікали б між перевірками.
		restoreMocks: true
	}
});
