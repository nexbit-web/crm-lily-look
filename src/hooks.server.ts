import { error, redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';

/** Єдині адреси, доступні без сесії: сама сторінка входу та ендпоінти auth. */
function isPublic(pathname: string): boolean {
	return pathname === '/login' || pathname.startsWith('/api/auth');
}

export const handle: Handle = async ({ event, resolve }) => {
	// Сесію читаємо один раз на запит — далі вона доступна у load-функціях
	// і actions через event.locals.
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Захист усього CRM живе тут, а не в (app)/+layout.server.ts.
	//
	// Це принципово: перед form action SvelteKit НЕ виконує load-функції, тому
	// редірект у layout не заважав би надіслати POST на ?/delete без сесії.
	// Хук же відпрацьовує на кожному запиті, включно з actions і API.
	if (!building && !isPublic(event.url.pathname) && !event.locals.user) {
		if (event.request.method !== 'GET') error(401, 'Потрібна авторизація');
		redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}

	// Сам обробляє /api/auth/* (вхід, вихід, сесія), решту віддає SvelteKit.
	return svelteKitHandler({ event, resolve, auth, building });
};
