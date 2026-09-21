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

/**
 * public_id файлу з його ж адреси.
 *
 *   .../image/upload/v1789143451/lily-look/products/abc.png → lily-look/products/abc
 *
 * Cloudinary не має пошуку за URL, тому видалення можливе лише за public_id.
 * Версію (`v123…`) і розширення відкидаємо, теку лишаємо — вона частина id.
 */
export function cloudinaryPublicId(url: string): string | null {
	if (!isCloudinaryUrl(url)) return null;

	const marker = '/image/upload/';
	const at = url.indexOf(marker);
	if (at === -1) return null;

	let path = url.slice(at + marker.length).split('?')[0];

	// Трансформації й версія йдуть перед самим id: «w_80,h_80/v123/folder/x.jpg».
	const parts = path
		.split('/')
		.filter((part) => !/^v\d+$/.test(part) && !/^[a-z]+_[^/]+$/.test(part));
	if (parts.length === 0) return null;

	path = parts.join('/');
	const dot = path.lastIndexOf('.');
	return dot > 0 ? path.slice(0, dot) : path;
}

/**
 * Видаляє файл із Cloudinary. true — файла там більше немає (зокрема й тоді,
 * коли його вже не було).
 */
export async function destroyUpload(publicId: string): Promise<boolean> {
	const cloudName = requireEnv('CLOUDINARY_CLOUD_NAME');
	const apiKey = requireEnv('CLOUDINARY_API_KEY');
	const apiSecret = requireEnv('CLOUDINARY_API_SECRET');

	const timestamp = Math.floor(Date.now() / 1000);
	const toSign = `public_id=${publicId}&timestamp=${timestamp}`;
	const signature = createHash('sha1')
		.update(toSign + apiSecret)
		.digest('hex');

	const body = new FormData();
	body.append('public_id', publicId);
	body.append('timestamp', String(timestamp));
	body.append('api_key', apiKey);
	body.append('signature', signature);

	const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
		method: 'POST',
		body
	});
	const result = (await res.json().catch(() => null)) as { result?: string } | null;

	// «not found» теж вважаємо успіхом: мета — щоб файла не було.
	return result?.result === 'ok' || result?.result === 'not found';
}
