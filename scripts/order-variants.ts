/**
 * Розставляє ProductVariant.position наявним товарам.
 *
 *   npm run variants:order          — показати, що буде змінено
 *   npm run variants:order -- --write — записати
 *
 * Потрібен рівно один раз, після додавання колонки (prisma/sql/variant-position.sql):
 * у всіх рядків там нуль, і без цього кроку порядок був би випадковим.
 * Розміри впорядковуємо за шкалою, кольори всередині розміру — за абеткою,
 * бо іншого джерела для них уже не лишилось.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/server/db';
import { sizeRank } from '../src/lib/sizes';

const write = process.argv.includes('--write');

const products = await prisma.product.findMany({
	orderBy: { name: 'asc' },
	select: {
		id: true,
		name: true,
		variants: { select: { id: true, size: true, color: true, position: true } }
	}
});

let changed = 0;

for (const product of products) {
	const ordered = [...product.variants].sort((a, b) => {
		const bySize = sizeRank(a.size) - sizeRank(b.size);
		if (bySize !== 0) return bySize;
		// Однаковий ранг — порівнюємо самі рядки, щоб «S/M» і «M-XL» не
		// перемішувались випадково від запуску до запуску.
		const sameSize = a.size.localeCompare(b.size, 'uk');
		return sameSize !== 0 ? sameSize : a.color.localeCompare(b.color, 'uk');
	});

	const updates = ordered
		.map((variant, position) => ({ variant, position }))
		.filter((row) => row.variant.position !== row.position);

	if (updates.length === 0) continue;
	changed += 1;

	console.log(`${product.name}: ${ordered.map((v) => `${v.size}/${v.color}`).join('  ')}`);

	if (!write) continue;

	for (const { variant, position } of updates) {
		await prisma.productVariant.update({ where: { id: variant.id }, data: { position } });
	}
}

console.log(
	changed === 0
		? 'Порядок уже правильний — змінювати нічого.'
		: write
			? `Оновлено товарів: ${changed}.`
			: `Буде оновлено товарів: ${changed}. Запустіть з --write, щоб записати.`
);

await prisma.$disconnect();
