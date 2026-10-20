<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { BOT_ROLES, BOT_ROLE_HINTS, BOT_ROLE_LABELS, type BotRoleKey } from '$lib/bot';
	import { BOT_ROLE_ICONS } from './roles';

	/** Ролі бота картками: що вміє кожна, видно одразу. Як ролі співробітників CRM. */
	let {
		value,
		onselect,
		disabled = false
	}: { value: BotRoleKey; onselect: (role: BotRoleKey) => void; disabled?: boolean } = $props();
</script>

<div class="space-y-1.5" role="radiogroup" aria-label="Роль у боті">
	{#each BOT_ROLES as role (role)}
		{@const Icon = BOT_ROLE_ICONS[role]}
		{@const active = value === role}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			{disabled}
			class="flex w-full items-center gap-3 rounded-[10px] border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 {active
				? 'border-primary bg-primary/5'
				: 'border-border hover:bg-foreground/3'}"
			onclick={() => onselect(role)}
		>
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-[7px] {active
					? 'bg-primary text-primary-foreground'
					: 'bg-foreground/6 text-muted-foreground'}"
			>
				<Icon size={14} />
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-[13px] font-medium">{BOT_ROLE_LABELS[role]}</span>
				<span class="block text-[12px] text-muted-foreground">{BOT_ROLE_HINTS[role]}</span>
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
