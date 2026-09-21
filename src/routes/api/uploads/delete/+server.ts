import { error, json } from '@sveltejs/kit';
import { cloudinaryPublicId, destroyUpload } from '$lib/server/cloudinary';
import type { RequestHandler } from './$types';

/**
 * Видаляє фото з Cloudinary. Тільки для авторизованих співробітників.
 *
 * Приймає саме адресу, а не public_id: у формі є лише URL, а розбирати його
 * на клієнті означало б довіряти браузеру вибір, що саме видалити.
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Потрібна авторизація');

	const body = (await request.json().catch(() => null)) as { url?: string } | null;
	const publicId = body?.url ? cloudinaryPublicId(body.url) : null;

	if (!publicId) error(400, 'Очікується посилання на файл у Cloudinary');

	try {
		return json({ deleted: await destroyUpload(publicId) });
	} catch (err) {
		error(500, err instanceof Error ? err.message : 'Не вдалося видалити файл');
	}
};
