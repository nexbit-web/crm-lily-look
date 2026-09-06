import { prisma } from './db';

/**
 * Плаский список категорій з шляхом («Сукні → Вечірні») для <select>.
 */
export async function categoryOptions(): Promise<{ id: string; label: string }[]> {
	const categories = await prisma.category.findMany({
		orderBy: [{ position: 'asc' }, { name: 'asc' }],
		select: { id: true, name: true, parentId: true }
	});

	const byId = new Map(categories.map((category) => [category.id, category]));

	function pathOf(id: string): string {
		const parts: string[] = [];
		let current = byId.get(id);
		// Обмежуємо глибину — захист від циклу в зіпсованому дереві.
		for (let depth = 0; current && depth < 10; depth += 1) {
			parts.unshift(current.name);
			current = current.parentId ? byId.get(current.parentId) : undefined;
		}
		return parts.join(' → ');
	}

	return categories.map((category) => ({ id: category.id, label: pathOf(category.id) }));
}
