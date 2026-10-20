/**
 * Заглушка $app/server: поза SvelteKit поточного запиту немає. Тест, якому
 * він потрібен, підставляє свій через vi.mock.
 */
export function getRequestEvent(): never {
	throw new Error('Немає поточного запиту');
}
