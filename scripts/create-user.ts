/**
 * Створює співробітника CRM. Публічної реєстрації немає, тому це єдиний шлях
 * завести акаунт (у т.ч. найперший).
 *
 *   npm run user:create -- --email admin@lilylook.ua --password "Secret123" \
 *                          --name "Аня" --role ADMIN
 *
 * Пише лише в таблиці better-auth (user / account) — товарів і замовлень
 * магазину не торкається.
 */
import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { authOptions } from '../src/lib/server/auth-options';
import { prisma } from '../src/lib/server/db';
import { isRole, ROLES } from '../src/lib/permissions';

const auth = betterAuth(authOptions);

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);
	return index === -1 ? undefined : process.argv[index + 1];
}

const email = arg('email');
const password = arg('password');
const name = arg('name') ?? email?.split('@')[0];
const role = arg('role') ?? 'MANAGER';

if (!email || !password) {
	console.error('Треба --email і --password. Необовʼязково: --name, --role');
	process.exit(1);
}

if (!isRole(role)) {
	console.error(`Роль "${role}" невідома. Доступні: ${ROLES.join(', ')}`);
	process.exit(1);
}

const result = await auth.api.signUpEmail({
	body: { email, password, name: name! },
	asResponse: true
});

if (!result.ok) {
	const body = await result.text();
	console.error(`Не вдалося створити акаунт (${result.status}): ${body}`);
	process.exit(1);
}

// role має input: false, тому виставляємо його окремо, вже після реєстрації.
const user = await prisma.user.update({
	where: { email },
	data: { role },
	select: { id: true, email: true, name: true, role: true }
});

console.log('Створено:', user);
process.exit(0);
