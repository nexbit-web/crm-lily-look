import { error, redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import { invalidate, tagsForWrite } from '$lib/server/cache';
import { isSessionStale } from '$lib/server/sessions';

/**
 * Єдині адреси, доступні без сесії: сторінка входу, ендпоінти auth і вебхуки
 * для сайту (їх захищає власний секрет — див. /api/hooks).
 */
function isPublic(pathname: string): boolean {
	return (
		pathname === '/login' || pathname.startsWith('/api/auth') || pathname.startsWith('/api/hooks/')
	);
}

/**
 * Заголовки для кожної відповіді. CRM — внутрішня система: її не індексують
 * пошуковики, не вбудовують у чужі сторінки, а адреси з пошуком клієнтів
 * (/orders?q=телефон) не йдуть у Referer на зовнішні сайти.
 */
const SECURITY_HEADERS: Record<string, string> = {
	'X-Robots-Tag': 'noindex, nofollow',
	'X-Frame-Options': 'DENY',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'same-origin',
	'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function secure(response: Response): Response {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		try {
			response.headers.set(name, value);
		} catch {
			// Незмінні заголовки (відповідь, отримана через fetch) — лишаємо як є.
		}
	}
	return response;
}

export const handle: Handle = async ({ event, resolve }) => {
	// Сесію читаємо один раз на запит — далі вона доступна у load-функціях
	// і actions через event.locals. Зазвичай — з підписаної cookie, без бази.
	const headers = event.request.headers;
	let session = await auth.api.getSession({ headers });

	// Співробітника щойно видалили чи змінили йому роль — cookie ще памʼятає
	// старе. Для нього (і лише для нього) перечитуємо сесію з бази.
	if (session && (await isSessionStale(session.user.id))) {
		session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
	}

	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Захист усього CRM живе тут, а не в (app)/+layout.server.ts.
	//
	// Це принципово: перед form action SvelteKit НЕ виконує load-функції, тому
	// редірект у layout не заважав би надіслати POST на ?/delete без сесії.
	// Хук же відпрацьовує на кожному запиті, включно з actions і API.
	if (!building && !isPublic(event.url.pathname) && !event.locals.user) {
		// API (пошук, завантаження фото) читає JSON — редірект на сторінку входу
		// повернув би йому HTML замість зрозумілої помилки.
		if (event.request.method !== 'GET' || event.url.pathname.startsWith('/api/')) {
			error(401, 'Потрібна авторизація');
		}
		redirect(303, `/login?redirectTo=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}

	// Сам обробляє /api/auth/* (вхід, вихід, сесія), решту віддає SvelteKit.
	const response = await svelteKitHandler({ event, resolve, auth, building });

	// Будь-який запис у розділі скидає його кеш — ще до того, як браузер
	// попросить свіжі дані, тож після «Зберегти» на екрані вже нове. Одне місце
	// замість виклику в кожній дії: нову дію не вийде «забути».
	if (event.request.method !== 'GET') {
		await invalidate(...tagsForWrite(event.url.pathname));
	}

	return secure(response);
};
