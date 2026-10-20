<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import toast from '$lib/toast.svelte';
	import { Boxes, Eye, EyeOff, Ruler, Tag, Trash2 } from '@lucide/svelte';
	import ConfirmAlert, { alertActionClass } from '$lib/components/confirm-alert.svelte';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import ProductForm from '$lib/components/product-form.svelte';
	import { formatUah } from '$lib/money';
	import { badge } from '$lib/table';
	import ProductBar from '../product-bar.svelte';
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

	const tile = 'rounded-[12px] bg-block px-3.5 py-3';
	const tileLabel = 'flex items-center gap-1.5 text-[12px] text-muted-foreground';
</script>

<svelte:head><title>{product.name} — CRM LILY LOOK</title></svelte:head>

<ProductBar title={product.name} subtitle="/catalog/{product.slug} · оновлено {updatedAt}">
	{#snippet actions()}
		<button
			type="button"
			aria-label="Видалити товар"
			class="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
			onclick={() => (confirmOpen = true)}
		>
			<Trash2 size={15} />
		</button>
		<button
			type="submit"
			form="product-edit"
			class="flex h-7 items-center gap-1.5 rounded-[6px] bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
			disabled={submitting || Boolean(productForm?.isUploading())}
		>
			{#if submitting}<Spinner class="size-3.5" />{/if}
			Зберегти
		</button>
	{/snippet}
</ProductBar>

<div class="space-y-3 pb-6">
	<!-- Зведення: те, що рахує база і чого у формі немає. -->
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
		<div class={tile}>
			<p class={tileLabel}><Tag size={13} />{hasDiscount ? 'Ціна зі знижкою' : 'Ціна'}</p>
			<p class="mt-1 flex items-baseline gap-1.5 truncate tabular-nums">
				<span class="text-[17px] font-semibold tracking-tight">
					{formatUah(hasDiscount ? product.finalPrice : product.priceKop)}
				</span>
				{#if hasDiscount}
					<span class="text-xs text-muted-foreground line-through">
						{formatUah(product.priceKop)}
					</span>
				{/if}
			</p>
		</div>

		<div class={tile}>
			<p class={tileLabel}><Boxes size={13} />На складі</p>
			<p
				class="mt-1 text-[17px] font-semibold tracking-tight tabular-nums {totalStock === 0
					? 'text-destructive'
					: ''}"
			>
				{totalStock} <span class="text-[13px] font-normal text-muted-foreground">шт</span>
			</p>
		</div>

		<div class={tile}>
			<p class={tileLabel}><Ruler size={13} />Розмірів</p>
			<p class="mt-1 text-[17px] font-semibold tracking-tight tabular-nums">{sizeCount}</p>
		</div>

		<div class={tile}>
			<p class={tileLabel}>
				{#if product.isActive}<Eye size={13} />{:else}<EyeOff size={13} />{/if}
				Статус
			</p>
			<p class="mt-1.5">
				{#if product.isActive}
					<span class="{badge} bg-emerald-500 text-white">На сайті</span>
				{:else}
					<span class="{badge} bg-foreground/10 text-muted-foreground">Приховано</span>
				{/if}
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
					toast.success('Товар збережено');
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
					description: product.description,
					categoryId: product.categoryId,
					price: product.price,
					isActive: product.isActive,
					images: product.images,
					variants: product.variants,
					measurements: product.measurements,
					attributes: product.attributes
				}}
			/>
		{/key}
	</form>
</div>

<ConfirmAlert
	bind:open={confirmOpen}
	title="Видалити «{product.name}»?"
	description="Товар зникне з сайту разом з фото і розмірами. Оформлені замовлення не постраждають."
>
	{#snippet action()}
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleting = true;
				return async ({ result }) => {
					deleting = false;
					confirmOpen = false;
					if (result.type === 'redirect') toast.message(`«${product.name}» видалено.`);
					else if (result.type === 'error') {
						toast.error(result.error?.message ?? 'Не вдалося видалити');
					}
					await applyAction(result);
				};
			}}
		>
			<button type="submit" class={alertActionClass('danger')} disabled={deleting}>
				{#if deleting}<Spinner />{/if}
				Видалити
			</button>
		</form>
	{/snippet}
</ConfirmAlert>
