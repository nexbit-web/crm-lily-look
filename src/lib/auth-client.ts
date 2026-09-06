import { createAuthClient } from 'better-auth/svelte';
import { inferAdditionalFields } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
	// Дублює additionalFields з auth-options, щоб user.role був типізований
	// на клієнті (тип із $lib/server сюда тягнути не можна).
	plugins: [inferAdditionalFields({ user: { role: { type: 'string' } } })]
});

export const { signIn, signOut, useSession } = authClient;
