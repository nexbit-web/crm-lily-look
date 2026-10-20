import { error, json } from '@sveltejs/kit';
import { authorizeChannel } from '$lib/server/pusher';
import { ORDERS_CHANNEL } from '$lib/realtime';
import type { RequestHandler } from './$types';

/**
 * Дозвіл браузеру підписатися на приватний канал Pusher. Без сесії сюди не
 * дістатись — hooks.server.ts відповідає 401 на /api/* без входу.
 *
 * Підписуємо лише відомий канал: чужий підпис не має відкривати інших каналів.
 */
export const POST: RequestHandler = async ({ request }) => {
	const form = await request.formData();
	const socketId = String(form.get('socket_id') ?? '');
	const channel = String(form.get('channel_name') ?? '');

	if (!/^\d+\.\d+$/.test(socketId)) error(400, 'Невірний socket_id');
	if (channel !== ORDERS_CHANNEL) error(403, 'Канал недоступний');

	const auth = authorizeChannel(socketId, channel);
	if (!auth) error(503, 'Pusher не налаштований');
	return json(auth);
};
