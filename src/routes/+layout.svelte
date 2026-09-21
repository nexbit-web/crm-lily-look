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
  toastOptions={{
    duration: 4000,
    class: 'app-toast',
    style:
      'background: color-mix(in srgb, var(--card) 88%, transparent); color: var(--foreground); border: 1px solid color-mix(in srgb, var(--foreground) 10%, transparent); box-shadow: 0 12px 32px -12px rgba(0,0,0,0.24), 0 2px 6px rgba(0,0,0,0.06); backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%); padding: 11px 14px; font-size: 13.5px; line-height: 1.35; font-weight: 400; letter-spacing: -0.01em; border-radius: 24px;',
    iconTheme: {
      primary: 'var(--primary)',
      secondary: 'var(--primary-foreground)',
    },
  }}
/>
