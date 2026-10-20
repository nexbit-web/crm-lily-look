/**
 * Пошук по CRM — спільне для сервера (/api/search) і модалки пошуку.
 */

export const SEARCH_SCOPES = ['all', 'products', 'orders', 'categories', 'pages'] as const;

export type SearchScope = (typeof SEARCH_SCOPES)[number];

export const SCOPE_LABELS: Record<SearchScope, string> = {
	all: 'Усе',
	products: 'Товари',
	orders: 'Замовлення',
	categories: 'Категорії',
	pages: 'Розділи'
};

export function isScope(value: unknown): value is SearchScope {
	return typeof value === 'string' && (SEARCH_SCOPES as readonly string[]).includes(value);
}

export type SearchResults = {
	query: string;
	products: {
		id: string;
		name: string;
		category: string | null;
		image: string | null;
		/** Ціна, яку бачить покупець: зі знижкою, якщо вона діє. */
		price: number;
		isActive: boolean;
	}[];
	orders: {
		id: string;
		number: string;
		customer: string;
		total: number;
		status: string;
		createdAt: string;
	}[];
	categories: { id: string; name: string; parent: string | null; products: number }[];
};

/**
 * Розбиває текст на шматки, щоб підсвітити знайдене. Без HTML: сторінка
 * виводить шматки як текст, тож назва товару з тегами нічого не виконає.
 */
export function highlight(text: string, query: string): { text: string; match: boolean }[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [{ text, match: false }];

	const parts: { text: string; match: boolean }[] = [];
	const haystack = text.toLowerCase();
	let from = 0;

	for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
		if (at > from) parts.push({ text: text.slice(from, at), match: false });
		parts.push({ text: text.slice(at, at + needle.length), match: true });
		from = at + needle.length;
	}
	if (from < text.length) parts.push({ text: text.slice(from), match: false });

	return parts;
}
