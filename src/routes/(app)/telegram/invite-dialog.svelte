<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from '$lib/toast.svelte';
	import { Check, Copy, X } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { INVITE_TERMS, startCommand, type BotRoleKey } from '$lib/bot';
	import RoleCards from './role-cards.svelte';

	/**
	 * Новий код входу в бота. Після створення вікно не закривається, а показує
	 * готову команду — її копіюють і передають людині.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	let saving = $state(false);
	let copied = $state(false);
	/** Щойно створений код: поки вікно відкрите, показуємо готову команду. */
	let freshCode = $state('');
	let draft = $state({ role: 'MANAGER' as BotRoleKey, note: '', term: '7' });

	// Щоразу, як вікно відкривають, — чиста форма.
	$effect(() => {
		if (open) {
			draft = { role: 'MANAGER', note: '', term: '7' };
			freshCode = '';
			copied = false;
		}
	});

	async function copyCommand() {
		try {
			await navigator.clipboard.writeText(startCommand(freshCode));
			copied = true;
			toast.success('Команду скопійовано', { description: 'Надішліть її людині' });
		} catch {
			toast.error('Браузер не дав доступ до буфера');
		}
	}

	const fieldLabel = 'text-[12px] font-medium text-muted-foreground';
	const footerButton =
		'h-7 rounded-[6px] px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground';
	const primaryButton =
		'flex h-7 items-center gap-1.5 rounded-[6px] bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50';
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-[16px] border border-border p-0 shadow-2xl ring-0 sm:max-w-110"
	>
		<header class="flex items-start gap-3 border-b border-border px-5 py-3.5">
			<Dialog.Header class="min-w-0 flex-1 gap-0.5 text-left">
				<Dialog.Title class="text-[17px] font-semibold tracking-tight">
					{freshCode ? 'Код створено' : 'Новий код'}
				</Dialog.Title>
				<Dialog.Description class="text-[12px]">
					{freshCode
						? 'Людина надсилає цю команду боту — і входить із вибраною роллю.'
						: 'Одноразовий вхід у Telegram Bot для нової людини.'}
				</Dialog.Description>
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

		{#if freshCode}
			<div class="p-5">
				<button
					type="button"
					class="group flex w-full items-center gap-3 rounded-[10px] border border-border bg-foreground/3 px-4 py-3 text-left transition-colors hover:bg-foreground/6"
					title="Скопіювати"
					onclick={copyCommand}
				>
					<span class="min-w-0 flex-1 truncate font-mono text-[15px] font-medium">
						{startCommand(freshCode)}
					</span>
					<span class="shrink-0 text-muted-foreground group-hover:text-foreground">
						{#if copied}<Check size={16} />{:else}<Copy size={16} />{/if}
					</span>
				</button>
			</div>

			<footer class="flex items-center justify-end gap-1.5 border-t border-border px-5 py-3">
				<button type="button" class={footerButton} onclick={() => (open = false)}>Готово</button>
				<button type="button" class={primaryButton} onclick={copyCommand}>
					<Copy size={13} />
					Копіювати команду
				</button>
			</footer>
		{:else}
			<form
				method="POST"
				action="?/invite"
				class="flex min-h-0 flex-col"
				use:enhance={() => {
					saving = true;
					return async ({ result, update }) => {
						saving = false;
						if (result.type === 'failure') {
							toast.error(String(result.data?.message ?? 'Не вдалося створити код'));
						} else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Помилка сервера');
						} else if (result.type === 'success') {
							freshCode = String(result.data?.code ?? '');
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="role" value={draft.role} />
				<input type="hidden" name="term" value={draft.term} />

				<div class="min-h-0 space-y-4 overflow-y-auto p-5">
					<div class="space-y-1.5">
						<span class={fieldLabel}>Роль</span>
						<RoleCards value={draft.role} onselect={(role) => (draft.role = role)} />
					</div>

					<div class="space-y-1.5">
						<Label for="bot-note" class={fieldLabel}>Кому видаєте</Label>
						<Input
							id="bot-note"
							name="note"
							bind:value={draft.note}
							placeholder="Олена, склад"
							class="h-8 text-[13px] md:text-[13px]"
						/>
					</div>

					<div class="space-y-1.5">
						<span class={fieldLabel}>Термін дії</span>
						<div class="flex h-8 rounded-[8px] bg-foreground/6 p-0.5" role="radiogroup">
							{#each INVITE_TERMS as term (term.value)}
								<button
									type="button"
									role="radio"
									aria-checked={draft.term === term.value}
									class="flex-1 rounded-[6px] text-[12px] font-medium transition-colors {draft.term ===
									term.value
										? 'bg-card text-foreground shadow-sm ring-1 ring-border'
										: 'text-muted-foreground hover:text-foreground'}"
									onclick={() => (draft.term = term.value)}
								>
									{term.label}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<footer class="flex items-center justify-end gap-1.5 border-t border-border px-5 py-3">
					<Dialog.Close>
						{#snippet child({ props })}
							<button {...props} type="button" class={footerButton}>Скасувати</button>
						{/snippet}
					</Dialog.Close>
					<button type="submit" class={primaryButton} disabled={saving}>
						{#if saving}<Spinner class="size-3.5" />{/if}
						Створити код
					</button>
				</footer>
			</form>
		{/if}
	</Dialog.Content>
</Dialog.Root>
