<script lang="ts">
	import '../app.css';
	import Toaster from '$lib/components/toaster/toaster.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import favicon from '$lib/assets/favicon.svg';
	import nprogress from 'nprogress';
	import { navigating, page } from '$app/state';
	let { children } = $props();

	// Тости — у лівому нижньому куті робочої панелі CRM (сайдбар 52 px + відступи
	// 6 px, ще 12 px усередину панелі). На сторінці входу панелі немає — кут вікна.
	const inApp = $derived(page.route.id?.startsWith('/(app)') ?? false);

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
<Toaster class={inApp ? 'bottom-4.5 left-19' : 'bottom-4 left-4'} />
