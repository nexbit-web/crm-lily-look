<script lang="ts" module>
	import type { Role } from '$lib/permissions';

	export type StaffDraft = {
		id: string;
		name: string;
		email: string;
		password: string;
		role: Role;
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import toast from '$lib/toast.svelte';
	import { Check, Copy, Crown, Headset, RefreshCw, ShieldCheck, Trash2, X } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { ROLES } from '$lib/permissions';
	import { newPassword, ROLE_HINTS, ROLE_LABELS } from './roles';

	/**
	 * Картка співробітника в стилі CRM: шапка, поля одне під одним, ролі
	 * картками з поясненням, унизу — видалити ліворуч, зберегти праворуч.
	 * Для наявного змінюється лише роль; себе змінити не можна.
	 */
	let {
		open = $bindable(false),
		draft = $bindable(),
		meId
	}: { open?: boolean; draft: StaffDraft; meId: string } = $props();

	let saving = $state(false);
	let deleteArmed = $state(false);

	const isSelf = $derived(draft.id !== '' && draft.id === meId);

	$effect(() => {
		if (open) deleteArmed = false;
	});

	const ROLE_ICONS: Record<Role, typeof Crown> = {
		OPERATOR: Headset,
		MANAGER: ShieldCheck,
		ADMIN: Crown
	};

	function generatePassword() {
		draft.password = newPassword();
	}

	async function copyPassword() {
		try {
			await navigator.clipboard.writeText(draft.password);
			toast.success('Пароль скопійовано');
		} catch {
			toast.error('Браузер не дав доступ до буфера — скопіюйте вручну');
		}
	}

	const fieldLabel = 'text-[12px] font-medium text-muted-foreground';
	const control = 'h-8 text-[13px] md:text-[13px]';
	const inlineButton =
		'flex size-6 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground';
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
						if (result.data?.deleted) toast.message('Співробітника видалено.');
						else if (result.data?.created) {
							toast.success('Співробітника додано', {
								subject: draft.name || draft.email,
								description: ' — може входити в CRM'
							});
						} else toast.success('Роль змінено', { subject: draft.name });
					}
					await update({ reset: false });
				};
			}}
		>
			<input type="hidden" name="id" value={draft.id} />
			<input type="hidden" name="role" value={draft.role} />

			<header class="flex items-start gap-3 border-b border-border px-5 py-3.5">
				<Dialog.Header class="min-w-0 flex-1 gap-0.5 text-left">
					<Dialog.Title class="truncate text-[17px] font-semibold tracking-tight">
						{draft.id ? draft.name || draft.email : 'Новий співробітник'}
					</Dialog.Title>
					<Dialog.Description class="truncate text-[12px]">
						{#if draft.id}
							{draft.email}
						{:else}
							Пошта й пароль — це і є вхід у CRM. Передайте їх особисто.
						{/if}
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

			<div class="min-h-0 space-y-4 overflow-y-auto p-5">
				{#if !draft.id}
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1.5">
							<Label for="stf-name" class={fieldLabel}>Імʼя</Label>
							<Input
								id="stf-name"
								name="name"
								bind:value={draft.name}
								placeholder="Оля"
								autocomplete="off"
								class={control}
								required
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="stf-email" class={fieldLabel}>Пошта</Label>
							<Input
								id="stf-email"
								name="email"
								type="email"
								bind:value={draft.email}
								placeholder="olya@lilylook.ua"
								autocomplete="off"
								class={control}
								required
							/>
						</div>
					</div>

					<!-- Пароль генерується одразу при відкритті: набирати його руками
					     нема потреби, а вигадувати — тим більше. -->
					<div class="space-y-1.5">
						<Label for="stf-password" class={fieldLabel}>Пароль</Label>
						<div class="relative">
							<Input
								id="stf-password"
								name="password"
								bind:value={draft.password}
								autocomplete="off"
								class="{control} pr-16 font-mono md:text-[12px]"
								required
							/>
							<div class="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5">
								<button
									type="button"
									class={inlineButton}
									title="Інший пароль"
									aria-label="Інший пароль"
									onclick={generatePassword}
								>
									<RefreshCw size={13} />
								</button>
								<button
									type="button"
									class={inlineButton}
									title="Скопіювати"
									aria-label="Скопіювати пароль"
									onclick={copyPassword}
								>
									<Copy size={13} />
								</button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Ролі картками: що відкриває кожна, видно одразу. -->
				<div class="space-y-1.5">
					<span class={fieldLabel}>Роль</span>
					<div class="space-y-1.5" role="radiogroup" aria-label="Роль">
						{#each ROLES as role (role)}
							{@const Icon = ROLE_ICONS[role]}
							{@const active = draft.role === role}
							<button
								type="button"
								role="radio"
								aria-checked={active}
								disabled={isSelf}
								class="flex w-full items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 {active
									? 'border-primary bg-primary/5'
									: 'border-border hover:bg-foreground/3'}"
								onclick={() => (draft.role = role)}
							>
								<span
									class="flex size-8 shrink-0 items-center justify-center rounded-[8px] {active
										? 'bg-primary text-primary-foreground'
										: 'bg-foreground/6 text-muted-foreground'}"
								>
									<Icon size={15} />
								</span>
								<span class="min-w-0 flex-1">
									<span class="block text-[13px] font-medium">{ROLE_LABELS[role]}</span>
									<span class="block text-[12px] text-muted-foreground">{ROLE_HINTS[role]}</span>
								</span>
								<span
									class="flex size-4 shrink-0 items-center justify-center rounded-full border {active
										? 'border-primary bg-primary text-primary-foreground'
										: 'border-foreground/25'}"
								>
									{#if active}<Check size={10} strokeWidth={3.5} />{/if}
								</span>
							</button>
						{/each}
					</div>
					{#if isSelf}
						<p class="text-[12px] text-muted-foreground">
							Свою роль змінити не можна — це захист від випадкової втрати доступу.
						</p>
					{/if}
				</div>
			</div>

			<footer class="flex items-center gap-2 border-t border-border px-5 py-3">
				{#if draft.id && !isSelf}
					{#if deleteArmed}
						<span class="text-[12px] text-muted-foreground">Забрати доступ назавжди?</span>
						<button
							type="submit"
							formaction="?/delete"
							formnovalidate
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
								{isSelf ? 'Закрити' : 'Скасувати'}
							</button>
						{/snippet}
					</Dialog.Close>
					{#if !isSelf}
						<button
							type="submit"
							disabled={saving}
							class="flex h-7 items-center gap-1.5 rounded-[6px] bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{#if saving}<Spinner class="size-3.5" />{/if}
							{draft.id ? 'Зберегти' : 'Додати'}
						</button>
					{/if}
				</div>
			</footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
