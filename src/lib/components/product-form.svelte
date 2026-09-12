<script lang="ts">
	import { untrack } from 'svelte';
	import toast from 'svelte-hot-french-toast';
	import { Upload, ArrowUp, ArrowDown, Plus, Star, X } from '@lucide/svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import {
		cloudinarySignature,
		uploadToCloudinary,
		type CloudinarySignature
	} from '$lib/cloudinary-upload';
	import { slugify } from '$lib/slug';
	import { DEFAULT_ATTRIBUTE_NAMES, type AttributeOption } from '$lib/product-attributes';

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
		slug: string;
		description: string;
		categoryId: string;
		price: string;
		isActive: boolean;
		isFeatured: boolean;
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
		const bySize = new Map(measurements.map((row) => [row.size.trim().toUpperCase(), row]));

		for (const variant of variants) {
			const key = variant.size.trim().toUpperCase();
			let group = groups.get(key);

			if (!group) {
				const row = bySize.get(key);
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

		return [...groups.values()];
	}

	// Знімок пропса один раз: далі поля живуть своїм життям, поки користувач
	// їх редагує. Щоб підхопити свіжі дані з сервера, батьківська сторінка
	// перемонтовує компонент через {#key}.
	const seed = untrack(() => ({
		name: initial?.name ?? '',
		slug: initial?.slug ?? '',
		description: initial?.description ?? '',
		categoryId: initial?.categoryId ?? '',
		price: initial?.price ?? '',
		isActive: initial?.isActive ?? true,
		isFeatured: initial?.isFeatured ?? false,
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
	// Для наявного товару slug уже є — його не перегенеровуємо з назви.
	let slug = $state(seed.slug);
	let slugTouched = $state(seed.slug !== '');
	let description = $state(seed.description);
	let categoryId = $state(seed.categoryId);
	let price = $state(seed.price);
	let isActive = $state(seed.isActive);
	let isFeatured = $state(seed.isFeatured);
	let images = $state<ProductFormImage[]>(seed.images);
	let sizes = $state<SizeGroup[]>(seed.sizes);
	let attributes = $state<ProductFormAttribute[]>(seed.attributes);

	let uploading = $state(0);
	let fileInput = $state<HTMLInputElement | null>(null);

	const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
	/** Український (він же європейський) жіночий розмірний ряд. */
	const UA_SIZES = ['38', '40', '42', '44', '46', '48', '50', '52', '54'];

	const categoryLabel = $derived(categories.find((item) => item.id === categoryId)?.label);
	const slugPreview = $derived(slugTouched ? slug : slugify(name));

	// На сервер їде та сама пласка структура, що й раніше: розмір із групи
	// підставляється в кожен її рядок, тому розійтись їм ніде.
	const variantsPayload = $derived(
		sizes.flatMap((group) =>
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
		sizes.map((group) => ({
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

	function moveImage(index: number, delta: number) {
		const target = index + delta;
		if (target < 0 || target >= images.length) return;
		[images[index], images[target]] = [images[target], images[index]];
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

<div class="space-y-6">
	<Card.Root class="rounded-2xl">
		<Card.Header>
			<Card.Title>Основне</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-5">
			<div class="space-y-2">
				<Label for="pf-name">Назва</Label>
				<Input
					id="pf-name"
					name="name"
					bind:value={name}
					placeholder="Сукня вечірня «Лілея»"
					class="h-10"
					aria-invalid={fieldErrors.name ? 'true' : undefined}
					required
				/>
				<!-- Адресу на сайті складаємо з назви, тож редагувати нема чого:
				     показуємо результат, а на сервер він їде прихованим полем. -->
				<p class="truncate text-xs text-muted-foreground">/catalog/{slugPreview || '…'}</p>
				{#if fieldErrors.name}
					<p class="text-xs text-destructive">{fieldErrors.name}</p>
				{/if}
			</div>

			<div class="grid gap-5 md:grid-cols-2">
				<div class="space-y-2">
					<Label for="pf-category">Категорія</Label>
					<Select.Root type="single" name="categoryId" bind:value={categoryId}>
						<Select.Trigger
							id="pf-category"
							class="h-10 w-full"
							aria-invalid={fieldErrors.categoryId ? 'true' : undefined}
						>
							{categoryLabel ?? 'Виберіть категорію'}
						</Select.Trigger>
						<Select.Content>
							{#each categories as category (category.id)}
								<Select.Item value={category.id} label={category.label}>
									{category.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
					{#if fieldErrors.categoryId}
						<p class="text-xs text-destructive">{fieldErrors.categoryId}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="pf-price">
						Ціна, ₴ <span class="font-normal text-muted-foreground">до знижок</span>
					</Label>
					<Input
						id="pf-price"
						name="price"
						bind:value={price}
						inputmode="decimal"
						placeholder="1299.00"
						class="h-10"
						aria-invalid={fieldErrors.price ? 'true' : undefined}
						required
					/>
					{#if fieldErrors.price}
						<p class="text-xs text-destructive">{fieldErrors.price}</p>
					{/if}
				</div>
			</div>

			<div class="space-y-2">
				<Label for="pf-description">Опис</Label>
				<Textarea
					id="pf-description"
					name="description"
					bind:value={description}
					rows={5}
					placeholder="Тканина, посадка, догляд…"
					aria-invalid={fieldErrors.description ? 'true' : undefined}
				/>
				{#if fieldErrors.description}
					<p class="text-xs text-destructive">{fieldErrors.description}</p>
				{/if}
			</div>

			<div class="flex flex-wrap gap-x-8 gap-y-3 border-t pt-5">
				<div class="flex items-center gap-2">
					<Checkbox id="pf-active" name="isActive" value="on" bind:checked={isActive} />
					<Label for="pf-active" class="font-normal">Показувати на сайті</Label>
				</div>
				<div class="flex items-center gap-2">
					<Checkbox id="pf-featured" name="isFeatured" value="on" bind:checked={isFeatured} />
					<Label for="pf-featured" class="font-normal">
						<Star size={14} />
						У добірку на головній
					</Label>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="rounded-2xl">
		<Card.Header>
			<Card.Title>Характеристики</Card.Title>
			<Card.Description
				>Таблиця під описом товару на сайті. Порожні рядки не зберігаються.</Card.Description
			>
		</Card.Header>
		<Card.Content class="space-y-2">
			<div
				class="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] gap-3 px-1 text-xs text-muted-foreground"
			>
				<span>Назва</span>
				<span>Значення</span>
				<span></span>
			</div>

			{#each attributes as attribute, index (index)}
				<div class="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-3">
					<Input
						bind:value={attribute.name}
						placeholder="Склад"
						class="h-10 font-medium"
						list="pf-attr-names"
					/>
					<!-- Список значень залежить від назви в сусідньому полі: для
					     «Посадки» це три варіанти, для «Складу» — шпаргалка. -->
					<Input
						bind:value={attribute.value}
						placeholder="95% віскоза, 5% еластан"
						class="h-10"
						list={attributeListId(attribute.name)}
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						class="size-8 text-muted-foreground hover:text-destructive"
						aria-label="Видалити характеристику"
						onclick={() => attributes.splice(index, 1)}
					>
						<X size={15} />
					</Button>
				</div>
			{/each}

			{#if fieldErrors.attributes}
				<p class="text-xs text-destructive">{fieldErrors.attributes}</p>
			{/if}

			<Button
				type="button"
				variant="outline"
				size="sm"
				class="mt-2"
				onclick={() => attributes.push({ name: '', value: '' })}
			>
				<Plus size={14} />
				Характеристика
			</Button>

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
		</Card.Content>
	</Card.Root>

	<Card.Root class="rounded-2xl">
		<Card.Header>
			<Card.Title>Фото</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<Button
				type="button"
				variant="outline"
				onclick={() => fileInput?.click()}
				disabled={uploading > 0}
			>
				{#if uploading > 0}
					<Spinner />
					Завантаження ({uploading})
				{:else}
					<Upload size={16} />
					Додати фото
				{/if}
			</Button>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				multiple
				class="hidden"
				onchange={(event) => uploadFiles(event.currentTarget.files)}
			/>

			{#if fieldErrors.images}
				<p class="text-xs text-destructive">{fieldErrors.images}</p>
			{/if}

			{#if images.length > 0}
				<!-- Опис фото (alt) сервер бере з назви товару, тому руками його
				     ніхто не набирає. -->
				<div class="space-y-2">
					{#each images as image, index (image.url)}
						<div class="flex items-center gap-3 rounded-xl border p-2">
							<img
								src={cloudinaryThumb(image.url, 96)}
								alt={name || 'Фото товару'}
								class="size-12 shrink-0 rounded-lg object-cover"
							/>
							{#if index === 0}
								<Badge variant="secondary">Головне</Badge>
							{:else}
								<span class="text-xs text-muted-foreground">#{index + 1}</span>
							{/if}

							<!-- Колір фото: спільні сайт показує завжди, решту — тільки
							     коли вибрано саме цей колір. -->
							<Select.Root type="single" bind:value={image.color}>
								<Select.Trigger class="ml-auto h-9 w-40">
									{image.color || 'Спільне'}
								</Select.Trigger>
								<Select.Content>
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

							<div class="flex gap-1">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="size-8"
									aria-label="Перемістити вище"
									disabled={index === 0}
									onclick={() => moveImage(index, -1)}
								>
									<ArrowUp size={14} />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="size-8"
									aria-label="Перемістити нижче"
									disabled={index === images.length - 1}
									onclick={() => moveImage(index, 1)}
								>
									<ArrowDown size={14} />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="size-8 text-muted-foreground hover:text-destructive"
									aria-label="Видалити фото"
									onclick={() => images.splice(index, 1)}
								>
									<X size={14} />
								</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if colorsWithoutPhoto.length > 0}
				<p class="text-xs text-muted-foreground">
					На сайті залишаться без фото: {colorsWithoutPhoto.join(', ')}. Додайте фото цього кольору
					або поставте якомусь фото «Спільне».
				</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<Card.Root class="rounded-2xl">
		<Card.Header>
			<Card.Title>Розміри</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<!-- Підписи колонок — лише над першим блоком: далі їх тримає та сама
			     сітка, а повторювати шапку в кожній картці зайве. -->
			{#each sizes as group, groupIndex (groupIndex)}
				<div class="space-y-5 rounded-xl border bg-muted/20 p-4 sm:p-5">
					<div class="space-y-2">
						{#if groupIndex === 0}
							<div
								class="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.9fr_2rem] gap-3 px-1 text-xs text-muted-foreground"
							>
								<span>Розмір</span>
								<span>UA</span>
								<span>Груди, см</span>
								<span>Рукав, см</span>
								<span>Довжина, см</span>
								<span></span>
							</div>
						{/if}

						<div class="grid grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr_0.9fr_2rem] items-center gap-3">
							<Input
								bind:value={group.size}
								placeholder="M"
								class="h-10 bg-background font-medium"
								list="pf-sizes"
								onchange={() => syncUa(group)}
							/>
							<Input bind:value={group.ua} placeholder="46" class="h-10 bg-background" />
							<Input
								bind:value={group.chest}
								inputmode="numeric"
								placeholder="92"
								class="h-10 bg-background"
							/>
							<Input
								bind:value={group.sleeve}
								inputmode="numeric"
								placeholder="60"
								class="h-10 bg-background"
							/>
							<Input
								bind:value={group.length}
								inputmode="numeric"
								placeholder="92"
								class="h-10 bg-background"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								class="size-8 text-muted-foreground hover:text-destructive"
								aria-label="Видалити розмір"
								disabled={sizes.length === 1}
								onclick={() => sizes.splice(groupIndex, 1)}
							>
								<X size={15} />
							</Button>
						</div>
					</div>

					<div class="space-y-2 border-t pt-5">
						{#if groupIndex === 0}
							<div
								class="grid grid-cols-[minmax(0,1fr)_7rem_2rem] gap-3 px-1 text-xs text-muted-foreground"
							>
								<span>Колір</span>
								<span>Кількість</span>
								<span></span>
							</div>
						{/if}

						{#each group.colors as color, colorIndex (color.id ?? colorIndex)}
							<div class="grid grid-cols-[minmax(0,1fr)_7rem_2rem] items-center gap-3">
								<div class="relative">
									<!-- Крапля кольору всередині поля: окремої колонки HEX
									     немає, для відомих назв він підставляється з бази. -->
									<input
										type="color"
										value={/^#[0-9a-f]{6}$/i.test(color.colorHex) ? color.colorHex : '#000000'}
										oninput={(event) => (color.colorHex = event.currentTarget.value)}
										aria-label="Колір"
										class="absolute top-1/2 left-1.5 size-7 -translate-y-1/2 cursor-pointer"
									/>
									<Input
										bind:value={color.color}
										placeholder="Чорний"
										class="h-10 bg-background pl-11"
										list="pf-colors"
										onchange={() => syncColorHex(color)}
									/>
								</div>
								<Input
									bind:value={color.stock}
									inputmode="numeric"
									placeholder="0"
									class="h-10 bg-background"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="size-8 text-muted-foreground hover:text-destructive"
									aria-label="Видалити колір"
									disabled={group.colors.length === 1}
									onclick={() => group.colors.splice(colorIndex, 1)}
								>
									<X size={15} />
								</Button>
							</div>
						{/each}

						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="-ml-2 h-8 px-2 text-muted-foreground"
							onclick={() => group.colors.push(emptyColor())}
						>
							<Plus size={14} />
							Колір
						</Button>
					</div>
				</div>
			{/each}

			{#if fieldErrors.variants}
				<p class="text-xs text-destructive">{fieldErrors.variants}</p>
			{/if}
			{#if fieldErrors.measurements}
				<p class="text-xs text-destructive">{fieldErrors.measurements}</p>
			{/if}

			<div class="flex flex-wrap items-center gap-2">
				<Button type="button" variant="outline" size="sm" onclick={() => sizes.push(emptySize())}>
					<Plus size={14} />
					Розмір
				</Button>
				<Button
					type="button"
					variant="secondary"
					size="sm"
					onclick={() => addSizeRange(LETTER_SIZES)}
				>
					XS–XXL
				</Button>
				<Button type="button" variant="secondary" size="sm" onclick={() => addSizeRange(UA_SIZES)}>
					38–54
				</Button>
				{#each sizeOptions as size (size)}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						class="h-8 px-2 text-muted-foreground"
						onclick={() => addSizeRange([size])}
					>
						{size}
					</Button>
				{/each}
			</div>

			<datalist id="pf-sizes">
				{#each sizeSuggestions as size (size)}
					<option value={size}></option>
				{/each}
			</datalist>
			<datalist id="pf-colors">
				{#each colorOptions as option (option.color)}
					<option value={option.color}></option>
				{/each}
			</datalist>
		</Card.Content>
	</Card.Root>
</div>

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
