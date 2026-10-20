import { json } from '@sveltejs/kit';
import { search } from '$lib/server/search';
import { isScope } from '$lib/search';
import type { RequestHandler } from './$types';

/**
 * Пошук для модалки Ctrl K. Без сесії сюди не дістатись — hooks.server.ts
 * відповідає 401 на будь-який /api/* без входу.
 *
 * «Розділи» шукає сама модалка — це список сторінок, база тут ні до чого.
 */
export const GET: RequestHandler = async ({ url }) => {
	const scopeParam = url.searchParams.get('scope');
	const scope = isScope(scopeParam) && scopeParam !== 'pages' ? scopeParam : 'all';

	return json(await search(url.searchParams.get('q'), scope));
};
