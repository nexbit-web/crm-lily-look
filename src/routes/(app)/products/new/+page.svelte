<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import toast from '$lib/toast.svelte';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import ProductForm from '$lib/components/product-form.svelte';
	import ProductBar from '../product-bar.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let productForm = $state<ReturnType<typeof ProductForm> | null>(null);

	const fieldErrors = $derived((form?.fieldErrors ?? {}) as Record<string, string>);
</script>

<svelte:head><title>Новий товар — CRM LILY LOOK</title></svelte:head>

<form
	method="POST"
	use:enhance={({ formData }) => {
		submitting = true;
		const name = String(formData.get('name') ?? '').trim();
		return async ({ result }) => {
			submitting = false;
			if (result.type === 'redirect') {
				// Картка, як «Task created» у ClickUp: що створили й куди далі.
				toast.success('Товар створено', {
					subject: name,
					description: ' — уже в каталозі CRM',
					actions: [
						{ label: 'До списку', run: () => goto('/products') },
						{ label: 'Додати ще', run: () => goto('/products/new') }
					]
				});
			} else if (result.type === 'failure') {
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
	<ProductBar title="Новий товар" subtitle="Заповніть основне, розміри й фото">
		{#snippet actions()}
			<button
				type="submit"
				class="flex h-7 items-center gap-1.5 rounded-[6px] bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
				disabled={submitting || Boolean(productForm?.isUploading())}
			>
				{#if submitting}<Spinner class="size-3.5" />{/if}
				Створити товар
			</button>
		{/snippet}
	</ProductBar>

	<div class="pb-6">
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
