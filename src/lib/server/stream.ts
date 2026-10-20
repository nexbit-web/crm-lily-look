/**
 * Дані сторінки — стрімом лише при першому відкритті.
 *
 * Повний запит (isDataRequest === false): оболонка CRM і скелетон приходять
 * одразу, а дані з Redis чи бази — слідом у тій самій відповіді. Повільна база
 * чи слабкий інтернет більше не тримають білий екран.
 *
 * Переходи всередині CRM і invalidate після «Зберегти» (isDataRequest === true)
 * чекають дані, як раніше: інакше після кожної дії мигав би скелетон. На час
 * переходу скелетон показує layout (див. route-skeleton).
 *
 * Перевірки доступу робіть ДО виклику — помилка всередині промісу вже не стане
 * сторінкою 403, а лише повідомленням у скелетоні.
 */
export async function streamOnFirstLoad<T extends Record<string, unknown>>(
	event: { isDataRequest?: boolean },
	view: Promise<T>
): Promise<T | { view: Promise<T> }> {
	if (event.isDataRequest === false) return { view };
	return view;
}
