import { error, json } from '@sveltejs/kit';
import { signUpload } from '$lib/server/cloudinary';
import type { RequestHandler } from './$types';

/** Віддає підпис для завантаження фото. Тільки для авторизованих співробітників. */
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, 'Потрібна авторизація');

	try {
		return json(signUpload());
	} catch (err) {
		// Найчастіше — незаповнені CLOUDINARY_* у .env.
		error(500, err instanceof Error ? err.message : 'Не вдалося підписати завантаження');
	}
};
