/**
 * Тип даних сторінки, яка стрімить їх при першому відкритті
 * ($lib/server/stream): те, що приходить у промісі `view`.
 */
export type Loaded<D> = Awaited<Extract<D, { view: unknown }>['view']>;

/** Дані сторінки: або вже готові, або проміс на них (перше відкриття). */
export function viewOf<T>(data: T | { view: Promise<T> }): T | Promise<T> {
	return typeof data === 'object' && data !== null && 'view' in data
		? (data as { view: Promise<T> }).view
		: (data as T);
}
