<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import toast from 'svelte-hot-french-toast';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription
	} from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { signIn } from '$lib/auth-client';

	const id = $props.id();

	let email = $state('');
	let password = $state('');
	let loading = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		loading = true;

		const { error } = await signIn.email({ email, password });

		loading = false;

		if (error) {
			toast.error(
				error.status === 401 ? 'Невірний email або пароль' : (error.message ?? 'Не вдалося увійти')
			);
			return;
		}

		toast.success('Вітаємо в CRM LILY LOOK');
		// Сесія вже в кукі — перечитуємо load-функції, щоб layout побачив user.
		await invalidateAll();

		// Тільки відносний шлях, інакше редірект можна завернути на чужий домен.
		const target = page.url.searchParams.get('redirectTo');
		await goto(target?.startsWith('/') ? target : '/');
	}
</script>

<Card.Root class="mx-auto w-full max-w-sm">
	<Card.Header>
		<Card.Title class="text-2xl tracking-tight">LILY LOOK</Card.Title>
		<Card.Description>Вхід до CRM магазину</Card.Description>
	</Card.Header>
	<Card.Content>
		<form onsubmit={handleSubmit}>
			<FieldGroup>
				<Field>
					<FieldLabel for="email-{id}">Email</FieldLabel>
					<Input
						id="email-{id}"
						type="email"
						autocomplete="username"
						placeholder="manager@lilylook.ua"
						bind:value={email}
						required
					/>
				</Field>
				<Field>
					<FieldLabel for="password-{id}">Пароль</FieldLabel>
					<Input
						id="password-{id}"
						type="password"
						autocomplete="current-password"
						bind:value={password}
						required
					/>
				</Field>
				<Field>
					<Button type="submit" class="w-full" disabled={loading}>
						{loading ? 'Заходимо…' : 'Увійти'}
					</Button>
					<FieldDescription class="text-center">
						Акаунти створює адміністратор — самостійної реєстрації немає.
					</FieldDescription>
				</Field>
			</FieldGroup>
		</form>
	</Card.Content>
</Card.Root>
