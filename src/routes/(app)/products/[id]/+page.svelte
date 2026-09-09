<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import toast from 'svelte-hot-french-toast';
	import { ChevronLeft, Trash2 } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import ProductForm from '$lib/components/product-form.svelte';
	import { formatUah } from '$lib/money';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let deleting = $state(false);
	let confirmOpen = $state(false);
	let productForm = $state<ReturnType<typeof ProductForm> | null>(null);
	/** Зростає після кожного збереження — перемонтовує форму свіжими даними. */
	let formVersion = $state(0);

	const fieldErrors = $derived((form?.fieldErrors ?? {}) as Record<string, string>);
	const product = $derived(data.product);
	const totalStock = $derived(
		product.variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0)
	);
	const sizeCount = $derived(new Set(product.variants.map((variant) => variant.size)).size);
	const hasDiscount = $derived(product.finalPrice > 0 && product.finalPrice < product.priceKop);

	/** «5 вер., 14:32» — дата тут довідкова, повний формат тільки заважає. */
	const updatedAt = $derived(
		new Date(product.updatedAt).toLocaleString('uk-UA', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		})
	);
</script>

<svelte:head><title>{product.name} — CRM LILY LOOK</title></svelte:head>

<!-- Панель дій приклеєна до верху скролу й напівпрозора: назва товару та
     «Зберегти» лишаються під рукою, скільки б не було розмірів. -->
<div
	class="sticky -top-6 z-30 -mx-6 -mt-6 mb-6 border-b border-border/70 bg-card/95 px-6 pt-6 pb-3 backdrop-blur-xl"
>
	<div class="mx-auto flex max-w-4xl items-center gap-3">
		<Button
			href="/products"
			variant="ghost"
			size="icon"
			class="-ml-2 shrink-0 rounded-full"
			aria-label="Назад до списку"
		>
			<ChevronLeft size={18} />
		</Button>

		<div class="min-w-0 flex-1">
			<h1 class="truncate text-[17px] leading-tight font-semibold tracking-tight">
				{product.name}
			</h1>
			<p class="truncate text-xs text-muted-foreground">/catalog/{product.slug}</p>
		</div>

		<Button
			variant="ghost"
			size="icon"
			aria-label="Видалити товар"
			class="shrink-0 rounded-full text-muted-foreground hover:text-destructive"
			onclick={() => (confirmOpen = true)}
		>
			<Trash2 size={17} />
		</Button>
		<Button
			type="submit"
			form="product-edit"
			class="shrink-0 rounded-full px-5"
			disabled={submitting || Boolean(productForm?.isUploading())}
		>
			{#if submitting}<Spinner />{/if}
			Зберегти
		</Button>
	</div>
</div>

<div class="mx-auto max-w-4xl space-y-6 pb-12">
	<!-- Зведення: те, що рахує база і чого у формі немає. Значення попереду,
	     підпис під ним — цифру видно з відстані, читати нічого не треба. -->
	<div class="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border/70 sm:grid-cols-4">
		<div class="bg-card px-5 py-4">
			<p class="truncate text-xl font-semibold tracking-tight tabular-nums">
				{formatUah(hasDiscount ? product.finalPrice : product.priceKop)}
			</p>
			<p class="mt-1 truncate text-xs text-muted-foreground">
				{#if hasDiscount}
					<span class="line-through">{formatUah(product.priceKop)}</span> зі знижкою
				{:else}
					Ціна
				{/if}
			</p>
		</div>

		<div class="bg-card px-5 py-4">
			<p
				class="text-xl font-semibold tracking-tight tabular-nums {totalStock === 0
					? 'text-destructive'
					: ''}"
			>
				{totalStock}
			</p>
			<p class="mt-1 text-xs text-muted-foreground">На складі</p>
		</div>

		<div class="bg-card px-5 py-4">
			<p class="text-xl font-semibold tracking-tight tabular-nums">{sizeCount}</p>
			<p class="mt-1 text-xs text-muted-foreground">Розмірів</p>
		</div>

		<div class="bg-card px-5 py-4">
			<p class="flex items-center gap-2 text-xl font-semibold tracking-tight">
				<span
					class="size-2 shrink-0 rounded-full {product.isActive
						? 'bg-emerald-500'
						: 'bg-muted-foreground/40'}"
				></span>
				{product.isActive ? 'На сайті' : 'Схований'}
			</p>
			<p class="mt-1 truncate text-xs text-muted-foreground">
				{product.isFeatured ? 'У добірці на головній' : 'Статус'}
			</p>
		</div>
	</div>

	<form
		id="product-edit"
		method="POST"
		action="?/save"
		use:enhance={() => {
			submitting = true;
			return async ({ result }) => {
				submitting = false;
				if (result.type === 'failure') {
					toast.error(String(result.data?.message ?? 'Не вдалося зберегти'));
				} else if (result.type === 'error') {
					toast.error(result.error?.message ?? 'Помилка сервера');
				}
				await applyAction(result);

				if (result.type === 'success') {
					// Без цього форма лишилась би зі старим знімком: нові варіанти
					// не мали б id і повторне збереження створило б їх удруге.
					await invalidateAll();
					formVersion += 1;
					toast.success('Збережено');
				}
			};
		}}
	>
		{#key formVersion}
			<ProductForm
				bind:this={productForm}
				categories={data.categories}
				sizeOptions={data.sizeOptions}
				colorOptions={data.colorOptions}
				attributeOptions={data.attributeOptions}
				{fieldErrors}
				initial={{
					name: product.name,
					slug: product.slug,
					description: product.description,
					categoryId: product.categoryId,
					price: product.price,
					isActive: product.isActive,
					isFeatured: product.isFeatured,
					images: product.images,
					variants: product.variants,
					measurements: product.measurements,
					attributes: product.attributes
				}}
			/>
		{/key}
	</form>

	<p class="text-center text-xs text-muted-foreground">Оновлено {updatedAt}</p>
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Видалити «{product.name}»?</Dialog.Title>
			<Dialog.Description>
				Товар зникне з сайту разом з фото і розмірами. Оформлені замовлення не постраждають.
			</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (confirmOpen = false)}>Скасувати</Button>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() => {
					deleting = true;
					return async ({ result }) => {
						deleting = false;
						confirmOpen = false;
						if (result.type === 'redirect') toast.success('Товар видалено');
						else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Не вдалося видалити');
						}
						await applyAction(result);
					};
				}}
			>
				<Button type="submit" variant="destructive" disabled={deleting}>
					{#if deleting}<Spinner />{/if}
					Видалити
				</Button>
			</form>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
