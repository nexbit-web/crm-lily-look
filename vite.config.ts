// Vite не кладе .env у process.env, а Prisma/better-auth і Cloudinary читають
// саме звідти — тож серверні модулі й tsx-скрипти (scripts/*) працюють з одного
// джерела.
//
// override обовʼязковий: Vite перезапускається в тому ж процесі, а dotenv за
// замовчуванням не перезаписує вже наявні змінні. Без нього значення, зчитане
// при першому старті (у т.ч. порожнє), залишалося б до повного рестарту Node.
import dotenv from 'dotenv';
import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-auto';
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

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	]
});
