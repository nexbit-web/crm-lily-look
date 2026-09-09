<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import toast from 'svelte-hot-french-toast';
	import { ChevronLeft } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import ProductForm from '$lib/components/product-form.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let productForm = $state<ReturnType<typeof ProductForm> | null>(null);

	const fieldErrors = $derived((form?.fieldErrors ?? {}) as Record<string, string>);
</script>

<svelte:head><title>Новий товар — CRM LILY LOOK</title></svelte:head>

<form
	method="POST"
	use:enhance={() => {
		submitting = true;
		return async ({ result }) => {
			submitting = false;
			if (result.type === 'redirect') toast.success('Товар створено');
			else if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Не вдалося зберегти'));
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Помилка сервера');
			}
			await applyAction(result);
		};
	}}
>
	<!-- Та сама панель, що й на сторінці товару: перехід між «створити» та
	     «редагувати» не мусить виглядати як інший застосунок. -->
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

			<h1 class="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">Новий товар</h1>

			<Button
				type="submit"
				class="shrink-0 rounded-full px-5"
				disabled={submitting || Boolean(productForm?.isUploading())}
			>
				{#if submitting}<Spinner />{/if}
				Зберегти
			</Button>
		</div>
	</div>

	<div class="mx-auto max-w-4xl pb-12">
		<ProductForm
			bind:this={productForm}
			categories={data.categories}
			sizeOptions={data.sizeOptions}
			colorOptions={data.colorOptions}
			attributeOptions={data.attributeOptions}
			{fieldErrors}
		/>
	</div>
</form>
