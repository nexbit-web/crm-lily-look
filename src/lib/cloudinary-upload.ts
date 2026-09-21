/**
 * Завантаження зображень із браузера напряму в Cloudinary.
 *
 * Файли не проходять через наш сервер — він лише підписує запит, а в базу
 * потрапляє готове посилання. Підпис має обмежений час життя, тому беремо
 * його на кожну пачку файлів, а не тримаємо в стані.
 */

export type CloudinarySignature = {
	cloudName: string;
	apiKey: string;
	timestamp: number;
	folder: string;
	signature: string;
};

/** Кидає помилку з текстом, придатним для toast. */
export async function cloudinarySignature(): Promise<CloudinarySignature> {
	let res: Response;
	try {
		res = await fetch('/api/uploads/sign', { method: 'POST' });
	} catch {
		throw new Error('Не вдалося звʼязатися з сервером');
	}

	if (!res.ok) {
		const body = await res.json().catch(() => ({ message: '' }));
		throw new Error(body.message || 'Cloudinary не налаштований — перевірте .env');
	}

	return res.json();
}

/** Повертає secure_url завантаженого файлу. */
export async function uploadToCloudinary(
	file: File,
	signature: CloudinarySignature
): Promise<string> {
	const body = new FormData();
	body.append('file', file);
	body.append('api_key', signature.apiKey);
	body.append('timestamp', String(signature.timestamp));
	body.append('folder', signature.folder);
	body.append('signature', signature.signature);

	const res = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
		method: 'POST',
		body
	});
	const result = await res.json().catch(() => null);

	if (!res.ok || !result?.secure_url) {
		throw new Error(result?.error?.message ?? 'помилка завантаження');
	}

	return result.secure_url as string;
}

/**
 * Видаляє файл із Cloudinary. Кидає помилку з текстом для toast.
 *
 * Викликається одразу на хрестик у формі: інакше кожне «завантажив не те»
 * лишало б на платформі файл, на який уже ніхто не посилається.
 */
export async function deleteFromCloudinary(url: string): Promise<void> {
	let res: Response;
	try {
		res = await fetch('/api/uploads/delete', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ url })
		});
	} catch {
		throw new Error('Не вдалося звʼязатися з сервером');
	}

	if (!res.ok) {
		const body = await res.json().catch(() => ({ message: '' }));
		throw new Error(body.message || 'Не вдалося видалити файл');
	}
}
