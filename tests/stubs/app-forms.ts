import { parse } from 'devalue';

/**
 * Заглушка $app/forms: те саме, що робить SvelteKit, — JSON відповіді дії,
 * а поле data в ньому закодоване devalue.
 */
export function deserialize(result: string) {
	const parsed = JSON.parse(result);
	if (parsed.data) parsed.data = parse(parsed.data);
	return parsed;
}
