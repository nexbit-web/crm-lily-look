<script lang="ts" module>
	/** Той самий маркер, що й на сервері: Select не вміє порожнє значення. */
	export const ROOT = 'root';

	export type CategoryDraft = {
		id: string;
		name: string;
		slug: string;
		parentId: string;
		imageUrl: string;
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from '$lib/toast.svelte';
	import { FolderTree, ImagePlus, Link2, Trash2, X } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import { cloudinarySignature, uploadToCloudinary } from '$lib/cloudinary-upload';
	import { slugify } from '$lib/slug';

	/**
	 * Картка категорії в стилі CRM: шапка з назвою, поля одне під одним,
	 * унизу — видалити ліворуч, скасувати й зберегти праворуч.
	 */
	let {
		open = $bindable(false),
		draft = $bindable(),
		parentOptions,
		pathOf
	}: {
		open?: boolean;
		draft: CategoryDraft;
		/** Куди можна вкласти: без самої категорії й її нащадків. */
		parentOptions: { id: string }[];
		/** «Сукні → Вечірні» — шлях від кореня. */
		pathOf: (id: string) => string;
	} = $props();

	let saving = $state(false);
	let uploading = $state(false);
	let deleteArmed = $state(false);
	let coverInput = $state<HTMLInputElement | null>(null);

	// Щоразу, як картку відкривають, підтвердження видалення скинуте.
	$effect(() => {
		if (open) deleteArmed = false;
	});

	const parentLabel = $derived(
		draft.parentId === ROOT ? 'Верхній рівень' : pathOf(draft.parentId) || 'Верхній рівень'
	);

	/** Адреса не змінюється при перейменуванні, тож для нової рахуємо з назви. */
	const slugPreview = $derived(draft.slug || slugify(draft.name));

	const fieldLabel = 'text-[12px] font-medium text-muted-foreground';
	const control = 'h-8 text-[13px] md:text-[13px]';

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

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-[16px] border border-border p-0 shadow-2xl ring-0 sm:max-w-120"
	>
		<form
			method="POST"
			action="?/save"
			class="flex min-h-0 flex-col"
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
						if (result.data?.deleted) toast.message('Категорію видалено.');
						else if (draft.id) toast.success('Категорію збережено');
						else {
							toast.success('Категорію створено', {
								subject: draft.name,
								description:
									draft.parentId === ROOT
										? ' — верхній рівень меню'
										: ` у «${pathOf(draft.parentId)}»`
							});
						}
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

			<!-- Шапка -->
			<header class="flex items-start gap-3 border-b border-border px-5 py-3.5">
				<Dialog.Header class="min-w-0 flex-1 gap-0.5 text-left">
					<Dialog.Title class="truncate text-[17px] font-semibold tracking-tight">
						{draft.id ? draft.name || 'Категорія' : 'Нова категорія'}
					</Dialog.Title>
					<Dialog.Description class="text-[12px]">Розділ каталогу на сайті</Dialog.Description>
				</Dialog.Header>
				<Dialog.Close>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							aria-label="Закрити"
							class="-mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
						>
							<X size={17} />
						</button>
					{/snippet}
				</Dialog.Close>
			</header>

			<!-- Поля -->
			<div class="min-h-0 space-y-4 overflow-y-auto p-5">
				<!-- Обкладинка: велика плитка, клік — вибрати файл -->
				<div class="flex items-center gap-3">
					<button
						type="button"
						class="group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border-[1.5px] border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:cursor-wait {draft.imageUrl
							? 'border-transparent'
							: ''}"
						aria-label={draft.imageUrl ? 'Замінити обкладинку' : 'Вибрати обкладинку'}
						disabled={uploading}
						onclick={() => coverInput?.click()}
					>
						{#if uploading}
							<Spinner />
						{:else if draft.imageUrl}
							<img
								src={cloudinaryThumb(draft.imageUrl, 128)}
								alt=""
								class="size-full object-cover"
							/>
						{:else}
							<ImagePlus size={20} />
						{/if}
					</button>
					<div class="min-w-0 flex-1">
						<p class="text-[13px] font-medium">Обкладинка</p>
						<p class="text-[12px] text-muted-foreground">Картинка розділу в каталозі</p>
						<div class="mt-1.5 flex gap-1.5">
							<button
								type="button"
								class="h-6 rounded-[6px] border border-border px-2 text-[12px] font-medium transition-colors hover:bg-foreground/5 disabled:opacity-50"
								disabled={uploading}
								onclick={() => coverInput?.click()}
							>
								{draft.imageUrl ? 'Замінити' : 'Вибрати'}
							</button>
							{#if draft.imageUrl}
								<button
									type="button"
									class="h-6 rounded-[6px] px-2 text-[12px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
									onclick={() => (draft.imageUrl = '')}
								>
									Прибрати
								</button>
							{/if}
						</div>
					</div>
				</div>

				<div class="space-y-1.5">
					<Label for="cat-name" class={fieldLabel}>Назва</Label>
					<Input
						id="cat-name"
						name="name"
						bind:value={draft.name}
						placeholder="Сукні"
						class={control}
						required
					/>
					<!-- Адресу складаємо з назви й далі не чіпаємо: перейменування не має
					     ламати вже опубліковані посилання. -->
					<p class="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
						<Link2 size={12} class="shrink-0" />
						/catalog/{slugPreview || '…'}
					</p>
				</div>

				<div class="space-y-1.5">
					<Label for="cat-parent" class={fieldLabel}>Розташування</Label>
					<Select.Root type="single" name="parentId" bind:value={draft.parentId}>
						<Select.Trigger id="cat-parent" class="w-full text-[13px]">
							<span class="flex min-w-0 items-center gap-2">
								<FolderTree size={14} class="shrink-0 text-muted-foreground" />
								<span class="truncate">{parentLabel}</span>
							</span>
						</Select.Trigger>
						<Select.Content class="max-h-60">
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

			<!-- Низ: видалити ліворуч, зберегти праворуч -->
			<footer class="flex items-center gap-2 border-t border-border px-5 py-3">
				{#if draft.id}
					{#if deleteArmed}
						<span class="text-[12px] text-muted-foreground">Видалити назавжди?</span>
						<button
							type="submit"
							formaction="?/delete"
							class="h-7 rounded-[6px] bg-destructive px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
						>
							Так, видалити
						</button>
						<button
							type="button"
							class="h-7 rounded-[6px] px-2 text-[12px] text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
							onclick={() => (deleteArmed = false)}
						>
							Ні
						</button>
					{:else}
						<button
							type="button"
							class="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10"
							onclick={() => (deleteArmed = true)}
						>
							<Trash2 size={13} />
							Видалити
						</button>
					{/if}
				{/if}

				<div class="ml-auto flex items-center gap-1.5">
					<Dialog.Close>
						{#snippet child({ props })}
							<button
								{...props}
								type="button"
								class="h-7 rounded-[6px] px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
							>
								Скасувати
							</button>
						{/snippet}
					</Dialog.Close>
					<button
						type="submit"
						disabled={saving || uploading}
						class="flex h-7 items-center gap-1.5 rounded-[6px] bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
					>
						{#if saving}<Spinner class="size-3.5" />{/if}
						{draft.id ? 'Зберегти' : 'Створити'}
					</button>
				</div>
			</footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
