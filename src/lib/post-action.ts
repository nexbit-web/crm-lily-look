import { deserialize } from '$app/forms';
import type { ActionResult } from '@sveltejs/kit';

/**
 * Викликати form action без форми — для «Скасувати» в тостах і перетягувань.
 * Мережа впала — повертаємо `error`, щоб виклик не мусив ловити виняток.
 */
export async function postAction(
	url: string,
	fields: Record<string, string | string[]>
): Promise<ActionResult> {
	const body = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		for (const item of Array.isArray(value) ? value : [value]) body.append(name, item);
	}

	try {
		const response = await fetch(url, {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		return deserialize(await response.text());
	} catch (err) {
		return { type: 'error', error: err };
	}
}

/** Дія вдалась? (redirect теж успіх — так відповідають створення й видалення.) */
export const succeeded = (result: ActionResult) =>
	result.type === 'success' || result.type === 'redirect';
