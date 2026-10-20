import { betterAuth } from 'better-auth';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { authOptions } from './auth-options';
import { authSecret } from './auth-secret';

export const auth = betterAuth({
	...authOptions,
	secret: authSecret(),
	// Проставляє Set-Cookie через SvelteKit, коли auth викликають на сервері.
	plugins: [sveltekitCookies(getRequestEvent)]
});

export type Session = typeof auth.$Infer.Session;
