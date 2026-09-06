/**
 * Конфіг лише для `npx @better-auth/cli generate`.
 *
 * CLI імпортує auth поза Vite, тому справжній `src/lib/server/auth.ts` йому не
 * підходить — там плагін, що тягне `$app/server`. Опції ті самі, з одного файлу.
 */
import { betterAuth } from 'better-auth';
import { authOptions } from '../src/lib/server/auth-options';

export const auth = betterAuth(authOptions);
