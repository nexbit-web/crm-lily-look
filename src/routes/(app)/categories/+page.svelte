<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';
	import {
		Plus,
		ChevronRight,
		ArrowUp,
		ArrowDown,
		ImagePlus,
		FolderTree,
		X,
		Check
	} from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import { cloudinarySignature, uploadToCloudinary } from '$lib/cloudinary-upload';
	import { slugify } from '$lib/slug';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Row = (typeof data.categories)[number];

	/** Той самий маркер, що й на сервері: Select не вміє порожнє значення. */
	const ROOT = 'root';
	/** Глибше третього рівня магазин категорії не показує. */
	const MAX_DEPTH = 2;

	let open = $state(false);
	let saving = $state(false);
	let uploading = $state(false);
	let deleteArmed = $state(false);
	let coverInput = $state<HTMLInputElement | null>(null);

	// Порожній id = створюємо нову; решта полів — чернетка, поки не збережуть.
	let draft = $state({ id: '', name: '', slug: '', parentId: ROOT, imageUrl: '' });

	const byId = $derived(new Map(data.categories.map((row) => [row.id, row])));

	/** «Сукні → Вечірні» — шлях від кореня, щоб у списку не було двох «Нових». */
	function pathOf(id: string): string {
		const parts: string[] = [];
		let current = byId.get(id);
		for (let depth = 0; current && depth < 10; depth += 1) {
			parts.unshift(current.name);
			current = current.parentId ? byId.get(current.parentId) : undefined;
		}
		return parts.join(' → ');
	}

	// Батьком не може стати ні сама категорія, ні її нащадок — інакше дерево
	// замкнеться саме на себе. Заодно ховаємо надто глибокі рівні.
	const parentOptions = $derived.by(() => {
		const parentById = new Map(data.categories.map((row) => [row.id, row.parentId]));

		/** Чи лежить рядок усередині категорії, яку зараз редагують. */
		const inside = (id: string) => {
			let current: string | null | undefined = id;
			for (let depth = 0; current && depth < 20; depth += 1) {
				if (current === draft.id) return true;
				current = parentById.get(current);
			}
			return false;
		};

		return data.categories.filter(
			(row) => row.depth < MAX_DEPTH && !(draft.id !== '' && inside(row.id))
		);
	});

	const parentLabel = $derived(
		draft.parentId === ROOT ? 'Верхній рівень' : pathOf(draft.parentId) || 'Верхній рівень'
	);

	/** Адреса не змінюється при перейменуванні, тож для нової рахуємо з назви. */
	const slugPreview = $derived(draft.slug || slugify(draft.name));

	/** «1 товар», «3 товари», «12 товарів». */
	function plural(count: number, one: string, few: string, many: string): string {
		const mod10 = count % 10;
		const mod100 = count % 100;
		if (mod10 === 1 && mod100 !== 11) return `${count} ${one}`;
		if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} ${few}`;
		return `${count} ${many}`;
	}

	function subtitle(row: Row): string {
		const parts = [plural(row.productCount, 'товар', 'товари', 'товарів')];
		if (row.childCount > 0) {
			parts.push(plural(row.childCount, 'підкатегорія', 'підкатегорії', 'підкатегорій'));
		}
		return parts.join(' · ');
	}

	function openCreate() {
		draft = { id: '', name: '', slug: '', parentId: ROOT, imageUrl: '' };
		deleteArmed = false;
		open = true;
	}

	function openEdit(row: Row) {
		draft = {
			id: row.id,
			name: row.name,
			slug: row.slug,
			parentId: row.parentId ?? ROOT,
			imageUrl: row.imageUrl ?? ''
		};
		deleteArmed = false;
		open = true;
	}

	async function uploadCover(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;

		uploading = true;
		try {
			draft.imageUrl = await uploadToCloudinary(file, await cloudinarySignature());
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Не вдалося завантажити');
		} finally {
			uploading = false;
			if (coverInput) coverInput.value = '';
		}
	}
</script>

<svelte:head><title>Категорії — CRM LILY LOOK</title></svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pb-12">
	<div class="flex items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Категорії</h1>
		<span class="text-2xl font-semibold tracking-tight text-muted-foreground/40">{data.total}</span>
		<Button class="ml-auto rounded-full px-5" onclick={openCreate}>
			<Plus size={16} />
			Категорія
		</Button>
	</div>

	{#if data.categories.length === 0}
		<div class="flex flex-col items-center gap-4 rounded-[20px] bg-muted/50 px-6 py-16 text-center">
			<FolderTree size={28} class="text-muted-foreground/40" />
			<p class="text-sm text-muted-foreground">
				Категорій ще немає — без них товар нікуди покласти.
			</p>
			<Button variant="outline" class="rounded-full" onclick={openCreate}>
				<Plus size={16} />
				Створити першу
			</Button>
		</div>
	{:else}
		<!-- Згрупований список без рамки: фон і радіус відділяють його від
		     сторінки, роздільники йдуть із відступом від тексту — так само
		     влаштовані списки в «Системних параметрах». -->
		<div class="overflow-hidden rounded-[20px] bg-muted/50">
			{#each data.categories as row, index (row.id)}
				<div class="relative flex items-center gap-2 py-1.5 pr-3 pl-3 hover:bg-foreground/[0.03]">
					{#if index > 0}
						<span
							class="pointer-events-none absolute top-0 right-3 h-px bg-foreground/10"
							style:left="calc(4rem + {row.depth * 1.5}rem)"
						></span>
					{/if}

					<button
						type="button"
						class="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
						onclick={() => openEdit(row)}
					>
						{#if row.depth > 0}
							<span class="shrink-0" style:width="{row.depth * 1.5}rem"></span>
						{/if}

						{#if row.imageUrl}
							<img
								src={cloudinaryThumb(row.imageUrl, 80)}
								alt=""
								class="size-10 shrink-0 rounded-[12px] object-cover"
							/>
						{:else}
							<div
								class="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-foreground/[0.06] text-muted-foreground/60"
							>
								<FolderTree size={16} />
							</div>
						{/if}

						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{row.name}</p>
							<p class="truncate text-xs text-muted-foreground">{subtitle(row)}</p>
						</div>

						<ChevronRight size={16} class="ml-auto shrink-0 text-muted-foreground/40" />
					</button>

					<form
						method="POST"
						action="?/move"
						class="flex shrink-0 items-center gap-1.5"
						use:enhance={() => {
							return async ({ result, update }) => {
								if (result.type === 'failure') {
									toast.error(String(result.data?.message ?? 'Не вдалося перемістити'));
								}
								await update({ reset: false });
							};
						}}
					>
						<input type="hidden" name="id" value={row.id} />
						<Button
							type="submit"
							name="dir"
							value="up"
							variant="ghost"
							size="icon"
							class="size-8 rounded-full bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.12] disabled:opacity-25"
							aria-label="Підняти вище"
							disabled={!row.canUp}
						>
							<ArrowUp size={15} strokeWidth={2.5} />
						</Button>
						<Button
							type="submit"
							name="dir"
							value="down"
							variant="ghost"
							size="icon"
							class="size-8 rounded-full bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/[0.12] disabled:opacity-25"
							aria-label="Опустити нижче"
							disabled={!row.canDown}
						>
							<ArrowDown size={15} strokeWidth={2.5} />
						</Button>
					</form>
				</div>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="max-h-[85dvh] gap-5 overflow-y-auto rounded-[28px] border-0 p-5 shadow-2xl ring-0 sm:max-w-md"
	>
		<form
			method="POST"
			action="?/save"
			class="contents"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'failure') {
						toast.error(String(result.data?.message ?? 'Не вдалося зберегти'));
					} else if (result.type === 'error') {
						toast.error(result.error?.message ?? 'Помилка сервера');
					} else if (result.type === 'success') {
						open = false;
						toast.success(result.data?.deleted ? 'Категорію видалено' : 'Збережено');
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="id" value={draft.id} />
			<input type="hidden" name="imageUrl" value={draft.imageUrl} />
			<input
				bind:this={coverInput}
				type="file"
				accept="image/*"
				class="hidden"
				onchange={(event) => uploadCover(event.currentTarget.files)}
			/>

			<!-- Закрити ліворуч, підтвердити праворуч — як у системних вікнах iOS.
			     Синій кружок тут єдиний акцент на все вікно. -->
			<div class="flex items-start justify-between">
				<Dialog.Close>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label="Закрити"
							class="flex size-9 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground/70 transition-colors hover:bg-foreground/[0.12]"
						>
							<X size={17} strokeWidth={2.5} />
						</button>
					{/snippet}
				</Dialog.Close>

				<button
					type="submit"
					aria-label="Зберегти"
					disabled={saving || uploading}
					class="flex size-9 items-center justify-center rounded-full bg-ring text-white transition-opacity hover:opacity-90 disabled:opacity-40"
				>
					{#if saving}
						<Spinner />
					{:else}
						<Check size={18} strokeWidth={3} />
					{/if}
				</button>
			</div>

			<Dialog.Header class="gap-1">
				<Dialog.Title class="text-xl tracking-tight">
					{draft.id ? draft.name || 'Категорія' : 'Нова категорія'}
				</Dialog.Title>
				<Dialog.Description>Розділ каталогу на сайті.</Dialog.Description>
			</Dialog.Header>

			<!-- Секція без рамки: підпис ліворуч, значення праворуч, роздільники
			     з відступом. Поля теж без обведення — їх виділяє заливка. -->
			<div class="overflow-hidden rounded-[18px] bg-muted/60">
				<div class="flex items-center justify-between gap-4 px-4 py-3">
					<span class="shrink-0 text-sm">Обкладинка</span>
					<div class="flex items-center gap-2">
						{#if draft.imageUrl}
							<img
								src={cloudinaryThumb(draft.imageUrl, 96)}
								alt=""
								class="size-10 shrink-0 rounded-[12px] object-cover"
							/>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								class="h-8 rounded-full px-3 text-muted-foreground"
								onclick={() => (draft.imageUrl = '')}
							>
								Прибрати
							</Button>
						{:else}
							<div
								class="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-foreground/[0.06] text-muted-foreground/50"
							>
								<ImagePlus size={16} />
							</div>
						{/if}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="h-8 rounded-full bg-background px-3 hover:bg-background/70"
							disabled={uploading}
							onclick={() => coverInput?.click()}
						>
							{#if uploading}
								<Spinner />
							{:else}
								{draft.imageUrl ? 'Замінити' : 'Вибрати'}
							{/if}
						</Button>
					</div>
				</div>

				<div class="mx-4 h-px bg-foreground/10"></div>

				<div class="flex items-center justify-between gap-4 px-4 py-3">
					<Label for="cat-name" class="shrink-0 font-normal">Назва</Label>
					<Input
						id="cat-name"
						name="name"
						bind:value={draft.name}
						placeholder="Сукні"
						class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none"
						required
					/>
				</div>

				<div class="mx-4 h-px bg-foreground/10"></div>

				<div class="flex items-center justify-between gap-4 px-4 py-3">
					<Label for="cat-parent" class="shrink-0 font-normal">Розташування</Label>
					<Select.Root type="single" name="parentId" bind:value={draft.parentId}>
						<Select.Trigger
							id="cat-parent"
							class="h-9 w-56 rounded-[10px] border-0 bg-background shadow-none"
						>
							{parentLabel}
						</Select.Trigger>
						<Select.Content class="rounded-[14px]">
							<Select.Item value={ROOT} label="Верхній рівень">Верхній рівень</Select.Item>
							{#each parentOptions as option (option.id)}
								<Select.Item value={option.id} label={pathOf(option.id)}>
									{pathOf(option.id)}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<!-- Адресу складаємо з назви й далі не чіпаємо: перейменування не має
			     ламати вже опубліковані посилання. -->
			<p class="-mt-3 truncate px-1 text-xs text-muted-foreground">
				/catalog/{slugPreview || '…'}
			</p>

			{#if draft.id}
				<div class="overflow-hidden rounded-[18px] bg-muted/60">
					{#if deleteArmed}
						<div class="flex items-center justify-between gap-3 px-4 py-2.5">
							<span class="text-sm text-muted-foreground">Видалити назавжди?</span>
							<div class="flex items-center gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									class="h-8 rounded-full px-3"
									onclick={() => (deleteArmed = false)}
								>
									Ні
								</Button>
								<Button
									type="submit"
									formaction="?/delete"
									variant="destructive"
									size="sm"
									class="h-8 rounded-full px-4"
								>
									Видалити
								</Button>
							</div>
						</div>
					{:else}
						<button
							type="button"
							class="w-full px-4 py-3 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
							onclick={() => (deleteArmed = true)}
						>
							Видалити категорію
						</button>
					{/if}
				</div>
			{/if}
		</form>
	</Dialog.Content>
</Dialog.Root>
