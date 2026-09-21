import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { cloudinaryPublicId, isCloudinaryUrl, signUpload } from '$lib/server/cloudinary';

/**
 * Безпека. Тут дві різні речі: у базу не має потрапити посилання на чужий
 * хост, а видалення мусить влучати рівно в той файл, який просили.
 */
describe('адреси Cloudinary', () => {
	it('приймає лише https на res.cloudinary.com', () => {
		expect(isCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/v1/a.jpg')).toBe(true);
	});

	it('відхиляє чужі хости, http і підроблені піддомени', () => {
		for (const url of [
			'http://res.cloudinary.com/demo/image/upload/a.jpg',
			'https://res.cloudinary.com.evil.com/demo/image/upload/a.jpg',
			'https://evil.com/res.cloudinary.com/a.jpg',
			'https://localhost/a.jpg',
			'javascript:alert(1)',
			'не посилання',
			''
		]) {
			expect(isCloudinaryUrl(url)).toBe(false);
		}
	});
});

describe('public_id з адреси', () => {
	it('відкидає версію й розширення, але лишає теку', () => {
		expect(
			cloudinaryPublicId(
				'https://res.cloudinary.com/demo/image/upload/v1789143451/lily-look/products/abc.png'
			)
		).toBe('lily-look/products/abc');
	});

	it('не плутає трансформації з текою', () => {
		expect(
			cloudinaryPublicId(
				'https://res.cloudinary.com/demo/image/upload/c_fill,w_80,h_80/v123/lily-look/products/abc.jpg'
			)
		).toBe('lily-look/products/abc');
	});

	it('працює без версії та без розширення', () => {
		expect(cloudinaryPublicId('https://res.cloudinary.com/demo/image/upload/lily-look/abc')).toBe(
			'lily-look/abc'
		);
	});

	it('повертає null для чужого хоста — інакше сервер видаляв би за вказівкою збоку', () => {
		expect(cloudinaryPublicId('https://evil.com/image/upload/v1/secret.png')).toBeNull();
		expect(cloudinaryPublicId('https://res.cloudinary.com/demo/video/upload/v1/a.mp4')).toBeNull();
	});
});

describe('підпис завантаження', () => {
	beforeEach(() => {
		process.env.CLOUDINARY_CLOUD_NAME = 'demo';
		process.env.CLOUDINARY_API_KEY = '111';
		process.env.CLOUDINARY_API_SECRET = 'top-secret';
	});

	it('підписує рівно ті параметри, що їх чекає Cloudinary', () => {
		const signed = signUpload('lily-look/products');
		const expected = createHash('sha1')
			.update(`folder=lily-look/products&timestamp=${signed.timestamp}top-secret`)
			.digest('hex');

		expect(signed.signature).toBe(expected);
	});

	it('не віддає у браузер api_secret', () => {
		const signed = signUpload();
		expect(JSON.stringify(signed)).not.toContain('top-secret');
		expect(Object.keys(signed)).toEqual([
			'cloudName',
			'apiKey',
			'timestamp',
			'folder',
			'signature'
		]);
	});

	it('без ключів у .env кидає зрозумілу помилку, а не мовчить', () => {
		delete process.env.CLOUDINARY_API_SECRET;
		expect(() => signUpload()).toThrow(/CLOUDINARY_API_SECRET/);
	});
});
