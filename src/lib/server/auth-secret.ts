import { building } from '$app/environment';

/**
 * Секрет better-auth (підпис cookie сесій).
 *
 * `vite build` імпортує серверні модулі, щоб проаналізувати маршрути, а
 * better-auth без секрету падає вже на створенні. Збірці секрет не потрібен —
 * вона нічого не підписує, — тож там підставляємо заглушку, і деплой не
 * залежить від того, чи видно змінні на етапі збірки.
 *
 * Під час роботи заглушки немає: без BETTER_AUTH_SECRET better-auth відмовиться
 * стартувати з явною помилкою в логах, а не працюватиме з відомим ключем.
 */
export function authSecret(): string | undefined {
	return (
		process.env.BETTER_AUTH_SECRET || (building ? 'build-only-placeholder-not-a-secret' : undefined)
	);
}
