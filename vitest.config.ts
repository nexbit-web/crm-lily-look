import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vitest/config';

const stub = (name: string) => fileURLToPath(new URL(`./tests/stubs/${name}.ts`, import.meta.url));

/**
 * `import { Check } from '@lucide/svelte'` → імпорт одного файлу іконки.
 *
 * Без цього Vitest компілює всі ~1600 іконок з барела на кожен прогін
 * (хвилина замість секунди). Vite у розробці збирає барел заздалегідь, тому
 * самому застосунку це не потрібно — лише тестам.
 */
function lucideDeepImports(): Plugin {
	const root = fileURLToPath(new URL('./node_modules/@lucide/svelte/dist/', import.meta.url));
	const files = [
		'icons/index.js',
		'aliases/aliases.js',
		'aliases/prefixed.js',
		'aliases/suffixed.js'
	];
	const icons = new Map<string, string>();

	for (const file of files) {
		const source = readFileSync(resolve(root, file), 'utf8');
		for (const [, names, from] of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
			const path = resolve(root, dirname(file), from).replace(/\.js$/, '.svelte');
			for (const [, name] of names.matchAll(/default as (\w+)/g)) icons.set(name, path);
		}
	}

	return {
		name: 'lucide-deep-imports',
		enforce: 'pre',
		transform(code, id) {
			if (id.includes('node_modules') || !code.includes('@lucide/svelte')) return;

			return code.replace(
				/import\s*\{([^}]*)\}\s*from\s*['"]@lucide\/svelte['"];?/g,
				(whole, list: string) => {
					const specifiers = list
						.split(',')
						.map((part) => part.trim())
						.filter(Boolean)
						.map((part) => part.split(/\s+as\s+/));
					// Типи й невідомі імена лишаємо барелу — краще повільно, ніж зламано.
					if (specifiers.some(([name]) => !icons.has(name))) return whole;

					return specifiers
						.map(
							([name, local = name]) => `import ${local} from ${JSON.stringify(icons.get(name))};`
						)
						.join('\n');
				}
			);
		}
	};
}

/**
 * Тести ганяємо без плагіна SvelteKit: він тягнув би за собою повну збірку й
 * згенерований клієнт Prisma (його немає в репозиторії).
 *
 * Лише компілятор Svelte — щоб сторінки можна було відрендерити на сервері й
 * перевірити розмітку, — і аліаси, які інакше дає SvelteKit.
 */
export default defineConfig({
	plugins: [
		lucideDeepImports(),
		svelte({
			// Налаштування SvelteKit живуть у vite.config.ts, окремого svelte.config немає.
			configFile: false,
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			}
		})
	],
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$app/environment': stub('app-environment'),
			'$app/navigation': stub('app-navigation'),
			'$app/state': stub('app-state')
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
