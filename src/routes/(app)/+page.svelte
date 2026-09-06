<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Дашборд — CRM LILY LOOK</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="flex items-center gap-3">
		<h1 class="text-2xl font-semibold tracking-tight">Дашборд</h1>
		<Badge variant="secondary">{data.user?.role ?? 'MANAGER'}</Badge>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Вхід працює</Card.Title>
			<Card.Description>
				Сесія better-auth активна, ця сторінка закрита для неавторизованих.
			</Card.Description>
		</Card.Header>
		<Card.Content class="text-sm text-muted-foreground">
			Далі тут будуть замовлення, товари, категорії та знижки з бази магазину.
		</Card.Content>
	</Card.Root>
</div>
