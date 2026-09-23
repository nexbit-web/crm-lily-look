import { randomBytes } from 'node:crypto';
import { prisma } from './db';
import type { BotRoleKey } from '$lib/bot';

/**
 * Алфавіт без схожих символів: немає 0/O та 1/I, щоб код можна було
 * продиктувати телефоном і не почути «нуль чи о?».
 */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Префікс — угода з власником, бот прийме будь-який рядок. */
const PREFIX = 'LILY-';

const LENGTH = 6;

/**
 * Код у верхньому регістрі: бот звіряє його посимвольно, без нормалізації
 * регістру й пробілів.
 *
 * 32 символи алфавіту рівно ділять 256, тому просте `byte % 32` не перекошує
 * розподіл — рівномірність тут не косметика, а мільярд варіантів замість
 * значно меншої кількості.
 */
export function randomInviteCode(): string {
	const bytes = randomBytes(LENGTH);
	let code = '';
	for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
	return PREFIX + code;
}

/**
 * Створює код, переживаючи збіг із наявним.
 *
 * Шанс мізерний, але на `code` унікальний індекс, і показувати власникові
 * помилку бази замість нового коду — не діло. P2002 — це саме той збіг.
 */
export async function createInvite(input: {
	role: BotRoleKey;
	note: string | null;
	expiresAt: Date | null;
}): Promise<{ code: string }> {
	for (let attempt = 0; attempt < 5; attempt += 1) {
		const code = randomInviteCode();
		try {
			await prisma.botInvite.create({
				data: { code, role: input.role, note: input.note, expiresAt: input.expiresAt },
				select: { id: true }
			});
			return { code };
		} catch (err) {
			if (!isUniqueViolation(err)) throw err;
		}
	}

	throw new Error('Не вдалося згенерувати унікальний код — спробуйте ще раз');
}

function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
}
