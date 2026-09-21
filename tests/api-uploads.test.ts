import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';

const { destroyUpload } = vi.hoisted(() => ({ destroyUpload: vi.fn() }));

// Замінюємо лише мережевий виклик: розбір адреси й підпис мусять лишитись
// справжніми — саме їх тут і перевіряємо.
vi.mock('$lib/server/cloudinary', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/cloudinary')>()),
	destroyUpload
}));

const { POST: remove } = await import('../src/routes/api/uploads/delete/+server');
const { POST: sign } = await import('../src/routes/api/uploads/sign/+server');

const PHOTO = 'https://res.cloudinary.com/demo/image/upload/v1789/lily-look/products/abc.png';
const user = { id: 'u1', role: 'OPERATOR' };

function call(handler: unknown, locals: { user: unknown }, body?: unknown) {
	const request = new Request('http://localhost/api/uploads', {
		method: 'POST',
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	return (handler as (event: unknown) => Promise<Response>)({ locals, request });
}

async function status(promise: Promise<Response>): Promise<number> {
	return promise.then(
		(res) => res.status,
		(err) => {
			expect(isHttpError(err)).toBe(true);
			return (err as { status: number }).status;
		}
	);
}

describe('видалення фото', () => {
	beforeEach(() => {
		destroyUpload.mockReset();
		destroyUpload.mockResolvedValue(true);
	});

	it('без сесії — 401, і до Cloudinary ми навіть не йдемо', async () => {
		expect(await status(call(remove, { user: null }, { url: PHOTO }))).toBe(401);
		expect(destroyUpload).not.toHaveBeenCalled();
	});

	it('видаляє саме той файл, що в адресі', async () => {
		const res = await call(remove, { user }, { url: PHOTO });

		expect(destroyUpload).toHaveBeenCalledWith('lily-look/products/abc');
		expect(await res.json()).toEqual({ deleted: true });
	});

	it('чужий хост і сміття у тілі — 400 без звернення до Cloudinary', async () => {
		// Ендпоінт приймає адресу, а не public_id: інакше браузер міг би
		// попросити видалити будь-який файл акаунта.
		for (const body of [
			{ url: 'https://evil.com/image/upload/v1/secret.png' },
			{ url: 'lily-look/products/abc' },
			{ url: '' },
			{},
			'не обʼєкт'
		]) {
			expect(await status(call(remove, { user }, body))).toBe(400);
		}

		expect(await status(call(remove, { user }))).toBe(400);
		expect(destroyUpload).not.toHaveBeenCalled();
	});

	it('помилку Cloudinary віддає як 500, а не як успіх', async () => {
		destroyUpload.mockRejectedValue(new Error('мережа недоступна'));
		expect(await status(call(remove, { user }, { url: PHOTO }))).toBe(500);
	});
});

describe('підпис завантаження', () => {
	beforeEach(() => {
		process.env.CLOUDINARY_CLOUD_NAME = 'demo';
		process.env.CLOUDINARY_API_KEY = '111';
		process.env.CLOUDINARY_API_SECRET = 'top-secret';
	});

	it('без сесії — 401', async () => {
		expect(await status(call(sign, { user: null }))).toBe(401);
	});

	it('авторизованому віддає підпис без api_secret', async () => {
		const res = await call(sign, { user });
		const body = (await res.json()) as Record<string, unknown>;

		expect(body.signature).toMatch(/^[a-f0-9]{40}$/);
		expect(JSON.stringify(body)).not.toContain('top-secret');
	});

	it('незаповнений .env — 500 із зрозумілим текстом, а не мовчазний збій', async () => {
		delete process.env.CLOUDINARY_API_SECRET;
		expect(await status(call(sign, { user }))).toBe(500);
	});
});
