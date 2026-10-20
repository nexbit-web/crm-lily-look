<script lang="ts">
	import { untrack, type Component } from 'svelte';
	import toast from '$lib/toast.svelte';
	import {
		CircleAlert,
		FileText,
		GripVertical,
		ImagePlus,
		Images,
		Link2,
		ListChecks,
		Plus,
		Ruler,
		Trash2,
		X,
		ZoomIn
	} from '@lucide/svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import SuggestInput from '$lib/components/suggest-input.svelte';
	import PhotoViewer, { warmPreview } from '$lib/components/photo-viewer.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import {
		cloudinarySignature,
		uploadToCloudinary,
		deleteFromCloudinary,
		type CloudinarySignature
	} from '$lib/cloudinary-upload';
	import { slugify } from '$lib/slug';
	import { skuFor } from '$lib/sku';
	import { DEFAULT_ATTRIBUTE_NAMES, type AttributeOption } from '$lib/product-attributes';
	import { bySize } from '$lib/sizes';
	import { pill } from '$lib/table';

	/** Фото товару. `color` — до якого кольору воно належить; '' — спільне. */
	export type ProductFormImage = { url: string; alt: string; color: string };
	export type ProductFormVariant = {
		id?: string;
		sku: string;
		size: string;
		color: string;
		colorHex: string;
		stock: string;
	};
	/** Заміри одного розміру: усе текстом, числа перевіряє сервер. */
	export type ProductFormMeasurement = {
		size: string;
		ua: string;
		chest: string;
		sleeve: string;
		length: string;
	};
	/** Рядок таблиці характеристик: «Склад» — «95% віскоза, 5% еластан». */
	export type ProductFormAttribute = {
		name: string;
		value: string;
	};
	export type ProductFormValues = {
		name: string;
		description: string;
		categoryId: string;
		price: string;
		isActive: boolean;
		images: ProductFormImage[];
		variants: ProductFormVariant[];
		measurements: ProductFormMeasurement[];
		attributes: ProductFormAttribute[];
	};

	let {
		categories,
		initial,
		fieldErrors = {},
		sizeOptions = [],
		colorOptions = [],
		attributeOptions = []
	}: {
		categories: { id: string; label: string }[];
		initial?: Partial<ProductFormValues>;
		fieldErrors?: Record<string, string>;
		/** Розміри, що вже є в базі — щоб написання не розходилось. */
		sizeOptions?: string[];
		/** Кольори з бази разом з HEX. */
		colorOptions?: { color: string; colorHex: string | null }[];
		/** Назви характеристик і значення, що вже зустрічаються в базі. */
		attributeOptions?: AttributeOption[];
	} = $props();

	/** Колір усередині розміру — саме він має кількість на складі й SKU. */
	type SizeColor = {
		id?: string;
		sku: string;
		color: string;
		colorHex: string;
		stock: string;
	};

	/**
	 * Один розмір товару: заміри виробу плюс кольори, у яких цей розмір є.
	 *
	 * У базі це дві різні таблиці (ProductVariant і ProductMeasurement), але
	 * для менеджера розмір — одна річ, тому в формі він набирається рівно раз.
	 * Пласку структуру для сервера збираємо назад у прихованих полях.
	 */
	type SizeGroup = {
		size: string;
		ua: string;
		chest: string;
		sleeve: string;
		length: string;
		colors: SizeColor[];
	};

	const emptyColor = (): SizeColor => ({
		sku: '',
		color: '',
		colorHex: '',
		stock: ''
	});

	const emptySize = (size = ''): SizeGroup => ({
		size,
		ua: '',
		chest: '',
		sleeve: '',
		length: '',
		colors: [emptyColor()]
	});

	/**
	 * Збирає пласкі variants + measurements із сервера в групи по розміру.
	 * Порядок розмірів беремо з варіантів — це той самий порядок, у якому їх
	 * колись набрали.
	 */
	function groupSizes(
		variants: ProductFormVariant[],
		measurements: ProductFormMeasurement[]
	): SizeGroup[] {
		// Локальний індекс усередині чистої функції: у стан він не потрапляє,
		// назовні йде звичайний масив — реактивна мапа тут ні до чого.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const groups = new Map<string, SizeGroup>();
		const measurementBySize = new Map(
			measurements.map((row) => [row.size.trim().toUpperCase(), row])
		);

		for (const variant of variants) {
			const key = variant.size.trim().toUpperCase();
			let group = groups.get(key);

			if (!group) {
				const row = measurementBySize.get(key);
				group = {
					size: variant.size,
					ua: row?.ua ?? '',
					chest: row?.chest ?? '',
					sleeve: row?.sleeve ?? '',
					length: row?.length ?? '',
					colors: []
				};
				groups.set(key, group);
			}

			group.colors.push({
				id: variant.id,
				sku: variant.sku,
				color: variant.color,
				colorHex: variant.colorHex,
				stock: variant.stock
			});
		}

		// Заміри для розміру, у якого не лишилось жодного варіанта — рідкість,
		// але мовчки їх втрачати не можна.
		for (const row of measurements) {
			const key = row.size.trim().toUpperCase();
			if (groups.has(key)) continue;
			groups.set(key, { ...row, colors: [emptyColor()] });
		}

		// Розміри показуємо за шкалою (XS перед XL), а кольори всередині —
		// у тому порядку, у якому їх набрали: його тримає ProductVariant.position,
		// і сервер віддає варіанти вже за ним.
		return bySize([...groups.values()], (group) => group.size);
	}

	// Знімок пропса один раз: далі поля живуть своїм життям, поки користувач
	// їх редагує. Щоб підхопити свіжі дані з сервера, батьківська сторінка
	// перемонтовує компонент через {#key}.
	const seed = untrack(() => ({
		name: initial?.name ?? '',
		description: initial?.description ?? '',
		categoryId: initial?.categoryId ?? '',
		price: initial?.price ?? '',
		isActive: initial?.isActive ?? true,
		images: initial?.images
			? initial.images.map((image) => ({ ...image, color: image.color ?? '' }))
			: [],
		sizes:
			initial?.variants?.length || initial?.measurements?.length
				? groupSizes(initial.variants ?? [], initial.measurements ?? [])
				: [emptySize()],
		// Товару без характеристик підставляємо стандартний набір назв: у
		// магазині він однаковий для всіх, а порожні рядки сервер відкидає —
		// тож нічого зайвого не збережеться.
		attributes: initial?.attributes?.length
			? initial.attributes.map((row) => ({ ...row }))
			: DEFAULT_ATTRIBUTE_NAMES.map((name) => ({ name, value: '' }))
	}));

	let name = $state(seed.name);
	let description = $state(seed.description);
	let categoryId = $state(seed.categoryId);
	let price = $state(seed.price);
	let isActive = $state(seed.isActive);
	let images = $state<ProductFormImage[]>(seed.images);
	let sizes = $state<SizeGroup[]>(seed.sizes);
	let attributes = $state<ProductFormAttribute[]>(seed.attributes);

	let uploading = $state(0);
	let fileInput = $state<HTMLInputElement | null>(null);
	/** Індекс фото, відкритого на весь екран; null — перегляд закритий. */
	let viewing = $state<number | null>(null);
	/** Над плиткою «Додати фото» тягнуть файли — підсвічуємо, куди кинути. */
	let dragging = $state(false);
	/** Фото, яке зараз тягнуть мишею, і плитка, над якою воно висить. */
	let dragFrom = $state<number | null>(null);
	let dragOver = $state<number | null>(null);

	// Вигляд у стилі CRM: блоки-картки, компактні поля 32 px, дрібні підписи.
	const card = 'rounded-[12px] bg-block p-4';
	const fieldLabel = 'text-[12px] font-medium text-muted-foreground';
	const control = 'h-8 text-[13px] md:text-[13px]';
	const iconButton =
		'flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-destructive disabled:pointer-events-none disabled:opacity-30';
	const dropzone =
		'flex flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed text-[12px] transition-colors disabled:cursor-wait';
	const dropzoneIdle =
		'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground';
	const dropzoneActive = 'border-primary bg-primary/5 text-foreground';
	const SIZE_FIELDS = ['Розмір', 'UA', 'Груди, см', 'Рукав, см', 'Довжина, см'];

	const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
	/** Український (він же європейський) жіночий розмірний ряд. */
	const UA_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54'];

	const categoryLabel = $derived(categories.find((item) => item.id === categoryId)?.label);
	// Адреса завжди йде за назвою — і в новому товарі, і при перейменуванні.
	// Окремого поля немає навмисно: два джерела правди тут нічого не дають,
	// а розсинхрон між назвою та адресою помітний одразу.
	const slugPreview = $derived(slugify(name));

	/**
	 * Порядок, у якому товар піде на сервер, і саме він стає `position` у базі.
	 *
	 * Сортуємо тут, а не в самому списку на екрані: рядок, який стрибає з-під
	 * курсора щойно ви дописали «XS», дратує. Після збереження форма
	 * перемонтовується вже відсортованою, тож результат видно одразу.
	 */
	const orderedSizes = $derived(bySize(sizes, (group) => group.size));

	// На сервер їде та сама пласка структура, що й раніше: розмір із групи
	// підставляється в кожен її рядок, тому розійтись їм ніде.
	const variantsPayload = $derived(
		orderedSizes.flatMap((group) =>
			group.colors.map((color) => ({
				id: color.id,
				sku: color.sku,
				size: group.size,
				color: color.color,
				colorHex: color.colorHex,
				stock: color.stock
			}))
		)
	);

	const measurementsPayload = $derived(
		orderedSizes.map((group) => ({
			size: group.size,
			ua: group.ua,
			chest: group.chest,
			sleeve: group.sleeve,
			length: group.length
		}))
	);

	// Кольори беремо з блоку розмірів: саме вони існують у цього товару, і саме
	// з ними сайт зіставляє фото.
	const photoColors = $derived([
		...new Set(
			sizes
				.flatMap((group) => group.colors.map((color) => color.color.trim()))
				.filter((color) => color !== '')
		)
	]);

	/**
	 * Кольори, у яких на сайті не буде жодного фото: власного немає, спільних
	 * теж. Не помилка — попередження, бо товар може бути ще в роботі.
	 */
	const colorsWithoutPhoto = $derived.by(() => {
		if (images.some((image) => image.color.trim() === '')) return [];
		const taken = new Set(images.map((image) => image.color.trim().toLowerCase()));
		return photoColors.filter((color) => !taken.has(color.toLowerCase()));
	});

	// Розміри з бази йдуть першими, далі — стандартні ряди без повторів.
	const sizeSuggestions = $derived([
		...new Set([...sizeOptions, ...LETTER_SIZES, ...UA_SIZES].map((size) => size.trim()))
	]);

	// Списки для меню в полях. Рахуємо один раз, а не в кожному рядку розмірів:
	// їх на сторінці може бути десяток, а набір значень усюди той самий.
	const sizeMenu = $derived(sizeSuggestions.map((size) => ({ value: size })));
	const colorMenu = $derived(
		colorOptions.map((option) => ({ value: option.color, hex: option.colorHex }))
	);

	/** Кнопка «Зберегти» в батьківській сторінці не має тиснутись під час аплоаду. */
	export function isUploading() {
		return uploading > 0;
	}

	async function uploadFiles(files: FileList | null) {
		if (!files || files.length === 0) return;

		let signature: CloudinarySignature;
		try {
			signature = await cloudinarySignature();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Не вдалося отримати підпис');
			return;
		}

		// Один підпис годиться для кількох файлів, поки не сплив його час.
		for (const file of Array.from(files)) {
			uploading += 1;
			try {
				// Колір нове фото не отримує: спільне — безпечніший стан за замовчуванням,
				// бо таке фото показується за будь-якого вибору на сайті.
				images.push({ url: await uploadToCloudinary(file, signature), alt: '', color: '' });
			} catch (err) {
				toast.error(`${file.name}: ${err instanceof Error ? err.message : 'помилка завантаження'}`);
			} finally {
				uploading -= 1;
			}
		}

		if (fileInput) fileInput.value = '';
	}

	/**
	 * Хрестик прибирає фото і з форми, і з Cloudinary.
	 *
	 * Спершу з форми — інтерфейс не мусить чекати на мережу; якщо видалення
	 * на платформі не вдалось, повертаємо рядок назад, щоб стан форми не
	 * розійшовся з тим, що реально лежить у сховищі.
	 */
	async function removeImage(index: number) {
		const [removed] = images.splice(index, 1);
		if (!removed) return;

		try {
			await deleteFromCloudinary(removed.url);
		} catch (err) {
			images.splice(index, 0, removed);
			toast.error(err instanceof Error ? err.message : 'Не вдалося видалити фото');
		}
	}

	/**
	 * Переносить фото мишею: те, що тягнули, стає на місце того, на яке
	 * кинули, решта зсувається. Лише в стані форми — у базу порядок піде
	 * разом із «Зберегти».
	 */
	function movePhoto(from: number, to: number) {
		if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) return;
		const [moved] = images.splice(from, 1);
		images.splice(to, 0, moved);
	}

	/** Файли з компʼютера над плиткою «Додати». Перенесення фото — не файли. */
	function onFileDragOver(event: DragEvent) {
		if (dragFrom !== null) return;
		event.preventDefault();
		dragging = true;
	}

	function onFileDrop(event: DragEvent) {
		event.preventDefault();
		dragging = false;
		if (dragFrom === null) uploadFiles(event.dataTransfer?.files ?? null);
	}

	/** Додає одразу весь ряд, пропускаючи розміри, що вже є. */
	function addSizeRange(list: string[]) {
		const known = new Set(sizes.map((group) => group.size.trim().toUpperCase()));
		// Набір кольорів беремо з першої заповненої групи — так швидше набивати.
		const template = sizes.find((group) => group.colors.some((c) => c.color.trim() !== ''));

		for (const size of list.filter((item) => !known.has(item.toUpperCase()))) {
			const group = emptySize(size);
			if (template) {
				// Без id: це нові варіанти, а не копії наявних.
				group.colors = template.colors.map((color) => ({
					...emptyColor(),
					color: color.color,
					colorHex: color.colorHex
				}));
			}
			syncUa(group);
			sizes.push(group);
		}

		// Прибираємо початкову порожню групу, якщо її так і не заповнили.
		const first = sizes[0];
		if (first && first.size === '' && first.colors.every((c) => c.color.trim() === '')) {
			sizes.shift();
		}
	}

	/**
	 * Літерний розмір → український ряд. Заповнюємо тільки порожнє поле:
	 * якщо менеджер вписав своє, ми його не перебиваємо.
	 */
	const UA_BY_LETTER: Record<string, string> = {
		XS: '40–42',
		S: '44',
		M: '46',
		L: '48',
		XL: '50–52',
		XXL: '54'
	};

	function syncUa(group: SizeGroup) {
		if (group.ua.trim() !== '') return;
		const ua = UA_BY_LETTER[group.size.trim().toUpperCase()];
		if (ua) group.ua = ua;
	}

	/**
	 * id datalist зі значеннями саме цієї характеристики; undefined — підказок
	 * немає. «Посадка» й «Сезон» мають короткий словник, тож вибір із трьох
	 * значень швидший і надійніший за набір руками.
	 */
	function attributeListId(attrName: string): string | undefined {
		const key = attrName.trim().toLowerCase();
		const index = attributeOptions.findIndex((option) => option.name.toLowerCase() === key);
		return index >= 0 && attributeOptions[index].values.length > 0 ? `pf-attr-${index}` : undefined;
	}

	/** Обрали відомий колір — підставляємо його HEX з бази. */
	function syncColorHex(color: SizeColor) {
		const match = colorOptions.find(
			(option) => option.color.toLowerCase() === color.color.trim().toLowerCase()
		);
		if (match?.colorHex) color.colorHex = match.colorHex;
	}
</script>

<!-- Стан живе в компоненті, на сервер їде як JSON у прихованих полях. -->
<input type="hidden" name="slug" value={slugPreview} />
<input type="hidden" name="images" value={JSON.stringify(images)} />
<input type="hidden" name="variants" value={JSON.stringify(variantsPayload)} />
<input type="hidden" name="measurements" value={JSON.stringify(measurementsPayload)} />
<input type="hidden" name="attributes" value={JSON.stringify(attributes)} />

{#snippet heading(Icon: Component, title: string, hint?: string)}
	<div class="mb-3 flex items-center gap-2">
		<Icon size={15} class="shrink-0 text-muted-foreground" />
		<h2 class="text-[14px] font-semibold tracking-tight">{title}</h2>
		{#if hint}
			<span class="truncate text-[12px] text-muted-foreground">{hint}</span>
		{/if}
	</div>
{/snippet}

{#snippet error(message: string | undefined)}
	{#if message}
		<p class="flex items-center gap-1.5 text-xs text-destructive">
			<CircleAlert size={13} class="shrink-0" />
			{message}
		</p>
	{/if}
{/snippet}

<!-- Дві колонки, як картка задачі в ClickUp: ліворуч усе, що описує товар
     (основне, розміри, характеристики), праворуч — видимість і фото, вони
     прилипають і лишаються на очах, поки гортаєш розміри. -->
<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-start">
	<div class="min-w-0 space-y-3">
		<!-- Основне -->
		<section class={card}>
			{@render heading(FileText, 'Основне')}
			<div class="space-y-3">
				<div class="space-y-1.5">
					<Label for="pf-name" class={fieldLabel}>Назва</Label>
					<Input
						id="pf-name"
						name="name"
						bind:value={name}
						placeholder="Сукня вечірня «Лілея»"
						class={control}
						aria-invalid={fieldErrors.name ? 'true' : undefined}
					/>
					<!-- Без native required: інакше браузер показав би власну підказку
					     й наші повідомлення з поясненням не зʼявились би взагалі.
					     Адресу на сайті складаємо з назви, тож редагувати нема чого. -->
					<p class="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
						<Link2 size={12} class="shrink-0" />
						/catalog/{slugPreview || '…'}
					</p>
					{@render error(fieldErrors.name)}
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-1.5">
						<Label for="pf-category" class={fieldLabel}>Категорія</Label>
						<Select.Root type="single" name="categoryId" bind:value={categoryId}>
							<Select.Trigger
								id="pf-category"
								class="w-full text-[13px]"
								aria-invalid={fieldErrors.categoryId ? 'true' : undefined}
							>
								{categoryLabel ?? 'Виберіть категорію'}
							</Select.Trigger>
							<!-- Не більше шести рядків на екран: категорій уже десятки,
							     далі список гортається. -->
							<Select.Content class="max-h-50">
								{#each categories as category (category.id)}
									<Select.Item value={category.id} label={category.label}>
										{category.label}
									</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						{@render error(fieldErrors.categoryId)}
					</div>

					<div class="space-y-1.5">
						<Label for="pf-price" class={fieldLabel}>
							Ціна <span class="font-normal opacity-70">до знижок</span>
						</Label>
						<div class="relative">
							<Input
								id="pf-price"
								name="price"
								bind:value={price}
								inputmode="decimal"
								placeholder="1299.00"
								class="{control} pr-7 tabular-nums"
								aria-invalid={fieldErrors.price ? 'true' : undefined}
							/>
							<span
								class="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[13px] text-muted-foreground"
							>
								₴
							</span>
						</div>
						{@render error(fieldErrors.price)}
					</div>
				</div>

				<div class="space-y-1.5">
					<Label for="pf-description" class={fieldLabel}>Опис</Label>
					<Textarea
						id="pf-description"
						name="description"
						bind:value={description}
						rows={5}
						placeholder="Тканина, посадка, догляд…"
						class="text-[13px]"
						aria-invalid={fieldErrors.description ? 'true' : undefined}
					/>
					{@render error(fieldErrors.description)}
				</div>
			</div>
		</section>

		<!-- Характеристики -->
		<section class={card}>
			{@render heading(ListChecks, 'Характеристики', 'Таблиця під описом на сайті')}
			<div class="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_1.75rem] items-center gap-2">
				<span class={fieldLabel}>Назва</span>
				<span class={fieldLabel}>Значення</span>
				<span></span>

				{#each attributes as attribute, index (index)}
					<Input
						bind:value={attribute.name}
						placeholder="Склад"
						class="{control} font-medium"
						list="pf-attr-names"
					/>
					<!-- Список значень залежить від назви в сусідньому полі: для
					     «Посадки» це три варіанти, для «Складу» — шпаргалка. -->
					<Input
						bind:value={attribute.value}
						placeholder="95% віскоза, 5% еластан"
						class={control}
						list={attributeListId(attribute.name)}
					/>
					<button
						type="button"
						class={iconButton}
						aria-label="Видалити характеристику"
						onclick={() => attributes.splice(index, 1)}
					>
						<X size={14} />
					</button>
				{/each}
			</div>

			<div class="mt-2.5 space-y-2">
				{@render error(fieldErrors.attributes)}
				<div class="flex items-center gap-2">
					<button
						type="button"
						class={pill}
						onclick={() => attributes.push({ name: '', value: '' })}
					>
						<Plus size={12} />
						Характеристика
					</button>
					<span class="text-[11px] text-muted-foreground">Порожні рядки не зберігаються</span>
				</div>
			</div>

			<datalist id="pf-attr-names">
				{#each attributeOptions as option (option.name)}
					<option value={option.name}></option>
				{/each}
			</datalist>
			{#each attributeOptions as option, index (option.name)}
				{#if option.values.length > 0}
					<datalist id="pf-attr-{index}">
						{#each option.values as value (value)}
							<option {value}></option>
						{/each}
					</datalist>
				{/if}
			{/each}
		</section>

		<!-- Розміри: кожен розмір — окрема картка із замірами й кольорами -->
		<section class={card}>
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<Ruler size={15} class="shrink-0 text-muted-foreground" />
				<h2 class="text-[14px] font-semibold tracking-tight">Розміри</h2>
				<span class="text-[12px] text-muted-foreground tabular-nums">{sizes.length}</span>
			</div>

			<div class="space-y-2">
				{#each sizes as group, groupIndex (groupIndex)}
					<div class="overflow-hidden rounded-[10px] border border-border bg-card">
						<!-- Заміри розміру -->
						<div class="p-2.5">
							<div
								class="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.9fr_1.75rem] items-center gap-2"
							>
								<!-- Підписи — лише над першим розміром: далі їх тримає та сама сітка. -->
								{#if groupIndex === 0}
									{#each SIZE_FIELDS as label (label)}
										<span class={fieldLabel}>{label}</span>
									{/each}
									<span></span>
								{/if}

								<!-- Поле лишається текстовим: свій розмір («S/M») теж має право
								     існувати. Меню — лише швидкий вибір уже відомих. -->
								<SuggestInput
									bind:value={group.size}
									options={sizeMenu}
									label="Вибрати розмір"
									placeholder="M"
									inputClass="font-semibold"
									oncommit={() => syncUa(group)}
								/>
								<Input bind:value={group.ua} placeholder="46" class={control} />
								<Input
									bind:value={group.chest}
									inputmode="numeric"
									placeholder="92"
									class={control}
								/>
								<Input
									bind:value={group.sleeve}
									inputmode="numeric"
									placeholder="60"
									class={control}
								/>
								<Input
									bind:value={group.length}
									inputmode="numeric"
									placeholder="92"
									class={control}
								/>
								<button
									type="button"
									class={iconButton}
									aria-label="Видалити розмір"
									disabled={sizes.length === 1}
									onclick={() => sizes.splice(groupIndex, 1)}
								>
									<Trash2 size={14} />
								</button>
							</div>
						</div>

						<!-- Кольори цього розміру: у кожного свій артикул і залишок -->
						<div class="space-y-2 border-t border-border bg-foreground/2 p-2.5">
							<div class="grid grid-cols-[minmax(0,1fr)_11rem_5.5rem_1.75rem] items-center gap-2">
								<span class={fieldLabel}>Колір</span>
								<span class={fieldLabel}>Артикул</span>
								<span class={fieldLabel}>Кількість</span>
								<span></span>

								{#each group.colors as color, colorIndex (color.id ?? colorIndex)}
									<SuggestInput
										bind:value={color.color}
										options={colorMenu}
										label="Вибрати колір"
										placeholder="Чорний"
										inputClass="pl-9"
										oncommit={() => syncColorHex(color)}
									>
										{#snippet leading()}
											<!-- Крапля кольору всередині поля: окремої колонки HEX
											     немає, для відомих назв він підставляється з бази. -->
											<input
												type="color"
												value={/^#[0-9a-f]{6}$/i.test(color.colorHex) ? color.colorHex : '#000000'}
												oninput={(event) => (color.colorHex = event.currentTarget.value)}
												aria-label="Колір"
												class="absolute top-1/2 left-1.5 z-10 size-5.5 -translate-y-1/2 cursor-pointer"
											/>
										{/snippet}
									</SuggestInput>
									<!-- Порожнє поле = артикул збереться за правилом і піде за
									     назвою, розміром і кольором. Вписаний руками лишається як є. -->
									<Input
										bind:value={color.sku}
										placeholder={skuFor(slugPreview, group.size, color.color) || 'авто'}
										spellcheck={false}
										class="{control} font-mono text-[12px]"
									/>
									<Input
										bind:value={color.stock}
										inputmode="numeric"
										placeholder="0"
										class="{control} tabular-nums"
									/>
									<button
										type="button"
										class={iconButton}
										aria-label="Видалити колір"
										disabled={group.colors.length === 1}
										onclick={() => group.colors.splice(colorIndex, 1)}
									>
										<X size={14} />
									</button>
								{/each}
							</div>

							<button type="button" class={pill} onclick={() => group.colors.push(emptyColor())}>
								<Plus size={12} />
								Колір
							</button>
						</div>
					</div>
				{/each}

				{@render error(fieldErrors.variants)}
				{@render error(fieldErrors.measurements)}

				<div class="flex flex-wrap items-center gap-1.5 pt-1">
					<button type="button" class={pill} onclick={() => sizes.push(emptySize())}>
						<Plus size={12} />
						Розмір
					</button>
					<button type="button" class={pill} onclick={() => addSizeRange(LETTER_SIZES)}>
						XS–XXL
					</button>
					<button type="button" class={pill} onclick={() => addSizeRange(UA_SIZES)}> 38–54 </button>
					{#each sizeOptions as size (size)}
						<button
							type="button"
							class="{pill} text-muted-foreground"
							onclick={() => addSizeRange([size])}
						>
							{size}
						</button>
					{/each}
				</div>
			</div>
		</section>
	</div>

	<div class="min-w-0 space-y-3 lg:sticky lg:top-14">
		<!-- Видимість: один перемикач, зелений як в iOS. Під ним звичайний
		     чекбокс, тож на сервер, як і раніше, їде isActive=on. -->
		<section class={card}>
			<label for="pf-active" class="flex cursor-pointer items-center gap-3">
				<span class="min-w-0 flex-1 text-[14px] font-semibold tracking-tight">
					Показувати на сайті
				</span>
				<input
					id="pf-active"
					type="checkbox"
					name="isActive"
					value="on"
					bind:checked={isActive}
					class="peer sr-only"
				/>
				<span
					aria-hidden="true"
					class="relative h-6 w-10 shrink-0 rounded-full bg-foreground/15 transition-colors duration-200 peer-checked:bg-[#34c759] peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow-[0_2px_4px_rgba(0,0,0,0.2)] after:transition-transform after:duration-200 peer-checked:after:translate-x-4 dark:peer-checked:bg-[#30d158]"
				></span>
			</label>
		</section>

		<!-- Фото: сітка мініатюр, перше — головне. Порядок міняється
		     перетягуванням мишею; зберігається разом з товаром. -->
		<section class={card}>
			{@render heading(Images, 'Фото', images.length > 0 ? String(images.length) : undefined)}

			{#if images.length === 0}
				<!-- Фото ще немає — одна велика кнопка: клік або перетягнути файли. -->
				<button
					type="button"
					class="{dropzone} h-32 w-full {dragging ? dropzoneActive : dropzoneIdle}"
					onclick={() => fileInput?.click()}
					disabled={uploading > 0}
					ondragover={onFileDragOver}
					ondragleave={() => (dragging = false)}
					ondrop={onFileDrop}
				>
					{#if uploading > 0}
						<Spinner />
						<span class="tabular-nums">Завантаження ({uploading})</span>
					{:else}
						<ImagePlus size={22} />
						<span class="text-[13px] font-medium text-foreground">Додати фото</span>
						<span class="text-[12px]">або перетягніть сюди файли</span>
					{/if}
				</button>
			{:else}
				<div class="grid grid-cols-3 gap-2">
					{#each images as image, index (image.url)}
						<div class="min-w-0 space-y-1.5">
							<!-- Клік по фото — відкрити на весь екран. Перенести — лише
							     за ручку в лівому верхньому куті: дві дії не плутаються. -->
							<div
								data-photo
								role="group"
								aria-label="Фото {index + 1}{index === 0 ? ', головне' : ''}"
								class="group relative aspect-square overflow-hidden rounded-[10px] bg-foreground/5 transition-[opacity,box-shadow] {dragFrom ===
								index
									? 'opacity-40'
									: ''} {dragOver === index && dragFrom !== null && dragFrom !== index
									? 'ring-2 ring-primary'
									: ''}"
								onpointerenter={() => warmPreview(image.url)}
								ondragover={(event) => {
									if (dragFrom === null) return;
									event.preventDefault();
									dragOver = index;
								}}
								ondrop={(event) => {
									event.preventDefault();
									if (dragFrom !== null) movePhoto(dragFrom, index);
									dragFrom = null;
									dragOver = null;
								}}
							>
								<button
									type="button"
									class="peer block size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
									aria-label="Переглянути фото на весь екран"
									onclick={() => (viewing = index)}
								>
									<img
										src={cloudinaryThumb(image.url, 240)}
										alt={name || 'Фото товару'}
										draggable="false"
										class="pointer-events-none size-full object-cover select-none"
									/>
								</button>

								<!-- Під курсором — лупа по центру: видно, що клік відкриває фото. -->
								<span
									class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100"
								>
									<span
										class="flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
									>
										<ZoomIn size={15} />
									</span>
								</span>

								<!-- Ручка: тягнеш за неї — переносиш фото. Картинка-привид
								     при цьому — уся плитка, а не сама іконка. -->
								<span
									draggable="true"
									role="button"
									tabindex="-1"
									aria-label="Перетягнути фото"
									title="Перетягніть, щоб змінити порядок"
									class="absolute top-1.5 left-1.5 flex size-6 cursor-grab items-center justify-center rounded-[6px] bg-black/60 text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100 hover:bg-black/80 active:cursor-grabbing [@media(hover:none)]:opacity-100"
									ondragstart={(event) => {
										dragFrom = index;
										const tile = event.currentTarget.closest('[data-photo]');
										if (event.dataTransfer) {
											event.dataTransfer.effectAllowed = 'move';
											event.dataTransfer.setData('text/plain', String(index));
											if (tile instanceof HTMLElement) {
												event.dataTransfer.setDragImage(tile, 16, 16);
											}
										}
									}}
									ondragend={() => {
										dragFrom = null;
										dragOver = null;
									}}
								>
									<GripVertical size={14} />
								</span>

								{#if index === 0}
									<span
										class="pointer-events-none absolute bottom-1.5 left-1.5 rounded-[5px] bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white uppercase"
									>
										Головне
									</span>
								{/if}

								<!-- Видалити — під курсором; на дотик кнопка видима завжди. -->
								<button
									type="button"
									class="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-destructive [@media(hover:none)]:opacity-100"
									aria-label="Видалити фото"
									onclick={() => removeImage(index)}
								>
									<X size={12} />
								</button>
							</div>

							<!-- Колір фото: спільні сайт показує завжди, решту — тільки
							     коли вибрано саме цей колір. -->
							<Select.Root type="single" bind:value={image.color}>
								<Select.Trigger size="sm" class="w-full px-2 text-[12px]">
									<span class="truncate">{image.color || 'Спільне'}</span>
								</Select.Trigger>
								<Select.Content class="max-h-50">
									<Select.Item value="" label="Спільне">Спільне</Select.Item>
									{#each photoColors as color (color)}
										<Select.Item value={color} label={color}>{color}</Select.Item>
									{/each}
									<!-- Колір, прибраний із розмірів, лишається в списку: інакше
									     він зник би із селекта, а в базі й далі стояв. -->
									{#if image.color && !photoColors.includes(image.color)}
										<Select.Item value={image.color} label={image.color}>
											{image.color} — немає серед розмірів
										</Select.Item>
									{/if}
								</Select.Content>
							</Select.Root>
						</div>
					{/each}

					<!-- Плитка «додати»: клік відкриває вибір файлів, сюди ж можна
					     перетягнути фото з компʼютера. -->
					<button
						type="button"
						class="{dropzone} aspect-square {dragging ? dropzoneActive : dropzoneIdle}"
						onclick={() => fileInput?.click()}
						disabled={uploading > 0}
						ondragover={onFileDragOver}
						ondragleave={() => (dragging = false)}
						ondrop={onFileDrop}
					>
						{#if uploading > 0}
							<Spinner />
							<span class="tabular-nums">{uploading}…</span>
						{:else}
							<ImagePlus size={18} />
							Додати
						{/if}
					</button>
				</div>

				<p class="mt-2 text-[11px] text-muted-foreground">
					Клік — відкрити фото. Щоб змінити порядок, тягніть за ручку в лівому куті. Порядок
					збережеться разом з товаром.
				</p>
			{/if}

			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				multiple
				class="hidden"
				onchange={(event) => uploadFiles(event.currentTarget.files)}
			/>

			<div class="mt-2.5 space-y-1.5 empty:hidden">
				{@render error(fieldErrors.images)}
				{#if colorsWithoutPhoto.length > 0}
					<p class="flex gap-1.5 text-[12px] text-muted-foreground">
						<CircleAlert size={13} class="mt-px shrink-0 text-amber-500" />
						<span>
							Без фото на сайті: {colorsWithoutPhoto.join(', ')}. Додайте фото цього кольору або
							поставте якомусь фото «Спільне».
						</span>
					</p>
				{/if}
			</div>
		</section>
	</div>
</div>

<!-- Перегляд фото живе поза сіткою форми: він накриває весь екран. -->
<PhotoViewer
	urls={images.map((image) => image.url)}
	bind:index={viewing}
	alt={name || 'Фото товару'}
/>

<style>
	/* Нативна піпетка як кругла крапля кольору: рамку, падінги й квадратний
	   свотч малює браузер, тому знімати їх доводиться вендорними правилами. */
	input[type='color'] {
		-webkit-appearance: none;
		appearance: none;
		border: none;
		background: transparent;
		padding: 0;
	}
	input[type='color']::-webkit-color-swatch-wrapper {
		padding: 0;
	}
	input[type='color']::-webkit-color-swatch {
		border: 1px solid var(--input);
		border-radius: 9999px;
	}
	input[type='color']::-moz-color-swatch {
		border: 1px solid var(--input);
		border-radius: 9999px;
	}
</style>
