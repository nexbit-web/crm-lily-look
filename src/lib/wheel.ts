/**
 * Колесо фортуни. Дані пише сайт (PageEvent, WheelSpin, поля prize* у Order),
 * CRM лише читає.
 */

/** Призи, як їх записує сайт. Невідомий показуємо як є. */
export const PRIZE_LABELS: Record<string, string> = {
	off3: '−3%',
	off5: '−5%',
	off7: '−7%',
	off10: '−10%',
	delivery: 'Безкоштовна доставка'
};

export function prizeLabel(prize: string): string {
	return PRIZE_LABELS[prize] ?? prize;
}

/** Колесо в таблиці джерел: ті, хто крутив, і ті, хто бачив, але закрив. */
export const WHEEL_GROUP_LABELS: Record<'spun' | 'shown', string> = {
	spun: 'Крутили колесо',
	shown: 'Бачили, не крутили'
};
