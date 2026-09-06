<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-hot-french-toast';
	import { ModeWatcher } from 'mode-watcher';
	import favicon from '$lib/assets/favicon.svg';
	import nprogress from 'nprogress';
	import { navigating } from '$app/state';
	let { children } = $props();

	nprogress.configure({ showSpinner: false, minimum: 0.15, speed: 300, trickleSpeed: 150 });

	// Смужка прогресу з'являється тільки на переходах, довших за 80 мс: посилання
	// прелоадяться на ховер (див. app.html), тож більшість навігацій миттєві
	// й блимання дратує сильніше, ніж допомагає.
	$effect(() => {
		if (!navigating.to) return;

		const timer = setTimeout(() => nprogress.start(), 80);
		return () => {
			clearTimeout(timer);
			nprogress.done();
		};
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{@render children()}

<ModeWatcher />
<Toaster
	position="top-center"
	toastOptions={{
		duration: 3000,
		class: 'app-toast',
		iconTheme: {
			primary: 'var(--primary)',
			secondary: 'var(--primary-foreground)'
		}
	}}
/>
