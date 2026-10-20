// Vite не кладе .env у process.env, а Prisma/better-auth і Cloudinary читають
// саме звідти — тож серверні модулі й tsx-скрипти (scripts/*) працюють з одного
// джерела.
//
// override обовʼязковий: Vite перезапускається в тому ж процесі, а dotenv за
// замовчуванням не перезаписує вже наявні змінні. Без нього значення, зчитане
// при першому старті (у т.ч. порожнє), залишалося б до повного рестарту Node.
import dotenv from 'dotenv';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-vercel';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

dotenv.config({ override: true, quiet: true });

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Vercel. Функції — у Франкфурті (fra1), поруч із базою Neon і Redis
			// (обидва в eu-central-1): кожен запит до них — 1–2 мс, а не 100 мс через
			// океан, як було б у типовому регіоні iad1 (Вашингтон).
			adapter: adapter({ runtime: 'nodejs22.x', regions: ['fra1'] })
		})
	]
});
