// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Session } from '$lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			/** Поточний співробітник CRM або null, якщо не авторизований. */
			user: Session['user'] | null;
			session: Session['session'] | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
