/**
 * Таблиці-списки в стилі ClickUp (замовлення, товари): сітка з лініями по
 * кожній клітинці, шапка на щабель відтінена, кнопки-пілюлі в панелі над
 * таблицею. Класи спільні, щоб сторінки не розʼїжджались між собою.
 */

/** Клітинка з лінією праворуч; рядок дає лінію знизу. Що не влазить — обрізається,
 *  а не налазить на сусідню колонку. */
export const cell =
	'flex h-full min-w-0 items-center overflow-hidden border-r border-border px-2 whitespace-nowrap last:border-r-0';

/** Сама таблиця: притиснута до країв панелі, лінія згори. */
export const table = 'border-t border-border bg-card';

/** Шапка: 32 px, відтінений фон, дрібний сірий текст. */
export const headRow =
	'grid h-8 border-b border-border bg-table-head text-[12px] text-muted-foreground';

/** Рядок: 36 px, лінія знизу, легка підсвітка під курсором. */
export const bodyRow =
	'grid h-9 w-full border-b border-border text-left text-[13px] transition-colors outline-none hover:bg-foreground/3 focus-visible:bg-foreground/5';

/** Кнопка-пілюля панелі над таблицею; вибрана — у колір теми. */
export const pill =
	'flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-[12px] font-medium text-foreground/80 transition-colors hover:bg-foreground/4 hover:text-foreground';
export const pillActive =
	'flex h-6 items-center gap-1.5 rounded-full border border-transparent bg-violet/15 px-2.5 text-[12px] font-medium text-violet transition-colors hover:bg-violet/20';

/** Меню фільтра під пілюлею: компактне, з великим скругленням. */
export const menu = 'w-48 rounded-[12px] p-1 shadow-xl';
export const menuItem = 'h-7.5 gap-2 rounded-[7px] px-2 text-[13px]';

/** Плашка в клітинці (статус, «на сайті»): заливка, значок, великі літери. */
export const badge =
	'inline-flex h-5.5 items-center gap-1 rounded-[6px] px-2 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase';
