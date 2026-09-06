/**
 * Роль співробітника CRM. Зберігається рядком у таблиці `user` (better-auth не
 * працює з postgres-enum), тому перевірки завжди йдуть через atLeast().
 */
export const ROLES = ['OPERATOR', 'MANAGER', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];

/** Чим вище число, тим більше прав. */
const RANK: Record<Role, number> = {
	OPERATOR: 0,
	MANAGER: 1,
	ADMIN: 2
};

export function isRole(value: unknown): value is Role {
	return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Невідома або порожня роль трактується як найменші права. */
export function toRole(value: unknown): Role {
	return isRole(value) ? value : 'OPERATOR';
}

/** true, якщо роль не нижча за `min`. */
export function atLeast(role: unknown, min: Role): boolean {
	return RANK[toRole(role)] >= RANK[min];
}
