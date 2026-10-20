import type { RequestHandler } from './$types';

/**
 * Кнопка «Оновити дані» на сторінці відвідуваності.
 *
 * Сам кеш скидає hooks.server.ts: це POST на адресу розділу /traffic, а
 * будь-який запис у розділі скидає його теги. Тут лишається тільки відповісти.
 * Без сесії сюди не дістатись — хук відповідає 401 раніше.
 */
export const POST: RequestHandler = () => new Response(null, { status: 204 });
