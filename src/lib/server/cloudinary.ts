import { createHash } from 'node:crypto';

/**
 * Підпис для завантаження файлу напряму з браузера в Cloudinary.
 *
 * Файл не проходить через наш сервер: SvelteKit має ліміт на розмір тіла
 * запиту (512 КБ в adapter-node), а фото товару майже завжди більше. Тому
 * сервер лише підписує параметри, а PUT робить сам браузер.
 */

export type CloudinarySignature = {
	cloudName: string;
	apiKey: string;
	timestamp: number;
	folder: string;
	signature: string;
};

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} не заданий у .env — завантаження фото не працюватиме`);
	}
	return value;
}

export const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER ?? 'lily-look/products';

export function signUpload(folder = CLOUDINARY_FOLDER): CloudinarySignature {
	const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME');
	const apiKey = requireEnv('CLOUDINARY_API_KEY');
	const apiSecret = requireEnv('CLOUDINARY_API_SECRET');

	const timestamp = Math.floor(Date.now() / 1000);

	// Cloudinary підписує параметри, відсортовані за назвою, і тільки ті, що
	// реально відправляються (без file, api_key, cloud_name, resource_type).
	const toSign = `folder=${folder}&timestamp=${timestamp}`;
	const signature = createHash('sha1')
		.update(toSign + apiSecret)
		.digest('hex');

	return { cloudName, apiKey, timestamp, folder, signature };
}

/** Хост Cloudinary — щоб не приймати в базу посилання куди завгодно. */
export function isCloudinaryUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'https:' && parsed.hostname === 'res.cloudinary.com';
	} catch {
		return false;
	}
}
