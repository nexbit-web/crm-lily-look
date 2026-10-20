/**
 * Колір теми CRM — кожен співробітник обирає свій у налаштуваннях.
 *
 * Зберігається в cookie браузера окремо для кожного користувача (у назві —
 * його id), тож на спільному компʼютері в кожного свій колір. У базу нічого не
 * пишемо. Cookie, а не localStorage, — щоб сервер одразу віддав сторінку
 * потрібного кольору, без спалаху чорного сайдбару.
 */
import { getContext, setContext } from 'svelte';

/**
 * `color` — квадратик у налаштуваннях і кнопки. `rail` — верх сайдбару:
 * глибший і насиченіший відтінок того ж кольору, як у ClickUp.
 */
export type Accent = {
	id: string;
	label: string;
	color: string;
	rail: string;
	/** Квадратик у налаштуваннях, якщо він інший, ніж `color`. */
	swatch?: string;
};

export const ACCENTS: Accent[] = [
	// Типовий: чорний сайдбар без градієнта, кнопки й фокус полів теж чорні.
	// Квадратик — графітовий, як у ClickUp: чорний на темній темі зливався з фоном.
	{ id: 'black', label: 'Графіт', color: '#111111', rail: '#111111', swatch: '#595d66' },
	{ id: 'violet', label: 'Фіолетовий', color: '#7b68ee', rail: '#5b45d6' },
	{ id: 'blue', label: 'Синій', color: '#1090e0', rail: '#0b73c2' },
	// Рожевий знято піпеткою з ClickUp: #c81d62 угорі → #6b173d унизу.
	{ id: 'pink', label: 'Рожевий', color: '#ee5e99', rail: '#c81d62' },
	{ id: 'purple', label: 'Пурпуровий', color: '#b660e0', rail: '#9233c4' },
	{ id: 'periwinkle', label: 'Блакитно-бузковий', color: '#6985ff', rail: '#4a63e6' },
	{ id: 'orange', label: 'Помаранчевий', color: '#e16b16', rail: '#c9560c' },
	{ id: 'teal', label: 'Бірюзовий', color: '#0f9d9f', rail: '#0b8587' },
	{ id: 'mocha', label: 'Мокко', color: '#aa8d80', rail: '#8c6f62' },
	{ id: 'green', label: 'Зелений', color: '#3db88b', rail: '#22986e' }
];

export const DEFAULT_ACCENT = 'black';

/** Назва cookie — своя для кожного співробітника. */
export function accentCookie(userId: string): string {
	return `crm-accent-${userId}`;
}

/** Лише відомі кольори; щось чуже в cookie — типовий чорний. */
export function parseAccent(value: string | null | undefined): string {
	return ACCENTS.some((accent) => accent.id === value) ? (value as string) : DEFAULT_ACCENT;
}

/** Сайдбар зверху вниз: заданий колір угорі, той самий на 54 % яскравості внизу. */
function railGradient(top: string): string {
	return `linear-gradient(180deg,${top} 0%,color-mix(in srgb,${top} 54%,black) 100%)`;
}

/**
 * CSS-змінні теми для вибраного кольору. Для чорного — нічого: лишаються
 * типові з app.css. Для решти сайдбар переливається зверху вниз, як у
 * ClickUp: угорі глибокий насичений колір, унизу — той самий, але вдвічі
 * темніший (знято з їхнього рожевого). Головні кнопки й фіолетові акценти
 * перефарбовуються в колір квадратика.
 *
 * У темній темі сайдбар приглушений — глибокий темний відтінок, щоб не
 * кричав поруч із чорною сторінкою.
 */
export function accentCss(id: string): string {
	const accent = ACCENTS.find((item) => item.id === id);
	if (!accent || accent.id === DEFAULT_ACCENT) return '';

	const { color: c, rail } = accent;
	// Темна тема, знято з фіолетового ClickUp: угорі той самий колір на 39 %
	// яскравості (#5a43d4 → #221b52), унизу він тане в майже чорний (#16152b).
	const dimTop = `color-mix(in srgb,${rail} 39%,black)`;
	const dimBottom = `color-mix(in srgb,${dimTop} 45%,#111111)`;

	// `:root:root` і `:root.dark` — сильніші за `:root` і `.dark` з app.css.
	// Темне правило йде другим і перекриває світле.
	return (
		`:root:root,:root.dark{--rail:${rail};--rail-bg:${railGradient(rail)};--primary:${c};--primary-foreground:#ffffff;--ring:${c};--violet:${c};--violet-soft:color-mix(in oklab,${c} 75%,white);}` +
		`:root.dark{--rail:${dimTop};--rail-bg:linear-gradient(180deg,${dimTop} 0%,${dimBottom} 100%);}`
	);
}

/** Вибраний колір і спосіб його змінити — макет CRM ділиться ним зі сторінками. */
export type AccentState = { readonly current: string; set(id: string): void };

const KEY = Symbol('accent');

export function provideAccent(state: AccentState): void {
	setContext(KEY, state);
}

export function useAccent(): AccentState {
	return getContext<AccentState>(KEY);
}
