/**
 * Перебудовує ProductVariant.sku за правилом `<slug>-<розмір>-<колір>`.
 *
 *   npm run sku:fix            — показати, що зміниться
 *   npm run sku:fix -- --write — записати
 *
 * Потрібен один раз: багато товарів зроблено зі старих демо-карток, і артикул
 * лишився від них — жилетка числилась під артикулом спідниці. Далі артикули
 * тримає сама CRM (див. $lib/server/product-sku).
 *
 * Оновлюємо лише sku наявних рядків. Видаляти й створювати варіанти не можна:
 * на ProductVariant.id посилаються кошики покупців (CartItem.variantId).
 * Старим замовленням це не зашкодить — OrderItem зберігає знімок артикула.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/server/db';
import { Prisma } from '../src/lib/server/prisma-client/client';
import { skuFor } from '../src/lib/sku';

const WRITE = process.argv.includes('--write');

type Change = { id: string; from: string; to: string; label: string };

/** Проміжне значення, щоб не зіткнутись з UNIQUE під час обміну артикулами. */
const PARKING = (id: string) => `tmp-${id}`;

/** Один UPDATE на всі рядки: значення передаються списком VALUES. */
function writeSkus(pairs: { id: string; sku: string }[]) {
	const values = Prisma.join(pairs.map((pair) => Prisma.sql`(${pair.id}, ${pair.sku})`));

	return prisma.$executeRaw`
		UPDATE "ProductVariant" v
		   SET sku = x.sku
		  FROM (VALUES ${values}) AS x(id, sku)
		 WHERE v.id = x.id
	`;
}

const park = (changes: Change[]) =>
	writeSkus(changes.map((change) => ({ id: change.id, sku: PARKING(change.id) })));

const apply = (changes: Change[]) =>
	writeSkus(changes.map((change) => ({ id: change.id, sku: change.to })));

async function main() {
	const products = await prisma.product.findMany({
		orderBy: { slug: 'asc' },
		select: {
			slug: true,
			name: true,
			variants: {
				orderBy: [{ position: 'asc' }, { id: 'asc' }],
				select: { id: true, sku: true, size: true, color: true }
			}
		}
	});

	const used = new Set<string>();
	const changes: Change[] = [];

	for (const product of products) {
		for (const variant of product.variants) {
			const base = skuFor(product.slug, variant.size, variant.color);

			let sku = base;
			for (let suffix = 2; used.has(sku); suffix += 1) sku = `${base}-${suffix}`;
			used.add(sku);

			if (sku !== variant.sku) {
				changes.push({
					id: variant.id,
					from: variant.sku,
					to: sku,
					label: `${product.name} · ${variant.size} / ${variant.color}`
				});
			}
		}
	}

	const total = products.reduce((sum, product) => sum + product.variants.length, 0);
	console.log(`Варіантів: ${total} · під заміну: ${changes.length}\n`);

	for (const change of changes) {
		console.log(`  ${change.label}`);
		console.log(`    ${change.from || '(порожній)'}\n    → ${change.to}`);
	}

	if (!WRITE) {
		console.log('\nПробний прогін. Щоб записати: npm run sku:fix -- --write');
		await prisma.$disconnect();
		return;
	}

	if (changes.length > 0) {
		// Два проходи: спершу всі рядки відводимо на тимчасові значення. Інакше
		// обмін артикулами між двома варіантами впирався б у UNIQUE — Postgres
		// перевіряє його на кожному рядку, а не в кінці запиту.
		//
		// Кожен прохід — один UPDATE ... FROM (VALUES …), а не сімдесят окремих:
		// сімдесят подорожей до Neon не вкладались у таймаут транзакції.
		await park(changes);
		await apply(changes);

		console.log(`\nОновлено рядків: ${changes.length}`);
	}

	// Перевірка з документа: після виправлення має бути порожньо.
	const bad = await prisma.$queryRaw<{ name: string; size: string; color: string; sku: string }[]>`
		SELECT p.name, v.size, v.color, v.sku
		FROM "ProductVariant" v
		JOIN "Product" p ON p.id = v."productId"
		WHERE v.sku NOT LIKE p.slug || '-%'
		   OR v.sku ~ '[^a-z0-9-]'
	`;

	console.log(`Перевірка: рядків поза правилом — ${bad.length}`);
	for (const row of bad) console.log(`  ${row.name} · ${row.size}/${row.color} · ${row.sku}`);

	await prisma.$disconnect();
}

await main();
