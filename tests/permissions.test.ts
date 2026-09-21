import { describe, expect, it } from 'vitest';
import { atLeast, isRole, ROLES, toRole } from '$lib/permissions';

/**
 * Безпека. Ролі — це рядок із таблиці better-auth, тобто дані, яким не можна
 * довіряти наосліп: там може опинитись що завгодно після правки вручну.
 */
describe('ролі', () => {
	it('старша роль проходить перевірку молодшої, але не навпаки', () => {
		expect(atLeast('ADMIN', 'MANAGER')).toBe(true);
		expect(atLeast('MANAGER', 'MANAGER')).toBe(true);
		expect(atLeast('OPERATOR', 'MANAGER')).toBe(false);
		expect(atLeast('MANAGER', 'ADMIN')).toBe(false);
	});

	it('невідоме значення дає найменші права, а не найбільші', () => {
		// Головне правило: будь-яке сміття в ролі мусить закривати доступ.
		for (const value of ['admin', 'SUPERUSER', '', null, undefined, 0, {}, ['ADMIN']]) {
			expect(atLeast(value, 'MANAGER')).toBe(false);
			expect(toRole(value)).toBe('OPERATOR');
		}
	});

	it('isRole не пропускає схожі рядки', () => {
		expect(isRole('ADMIN')).toBe(true);
		expect(isRole('Admin')).toBe(false);
		expect(isRole('ADMIN ')).toBe(false);
	});

	it('кожна роль із ROLES не нижча за себе', () => {
		for (const role of ROLES) expect(atLeast(role, role)).toBe(true);
	});
});
