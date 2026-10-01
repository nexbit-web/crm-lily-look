<script lang="ts">
	import { Globe, MousePointerClick } from '@lucide/svelte';

	/**
	 * Іконка джерела трафіку. Брендових іконок у Lucide немає, тому Facebook,
	 * Instagram і Google намальовані тут; «напряму» й «інше» — з Lucide.
	 *
	 * `mono` — одним кольором (currentColor), для синього активного фону.
	 */
	let {
		source,
		size = 14,
		mono = false
	}: { source: string; size?: number; mono?: boolean } = $props();

	const gradient = $props.id();

	// Сектори колеса: точки на колі радіуса 11 через кожні 60°, від верхньої.
	const RIM = [
		[12, 1],
		[21.53, 6.5],
		[21.53, 17.5],
		[12, 23],
		[2.47, 17.5],
		[2.47, 6.5]
	];
	const WHEEL_SLICES = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'].map(
		(color, index) => {
			const [x1, y1] = RIM[index];
			const [x2, y2] = RIM[(index + 1) % RIM.length];
			return { color, d: `M12 12L${x1} ${y1}A11 11 0 0 1 ${x2} ${y2}Z` };
		}
	);
</script>

{#if source === 'facebook'}
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="shrink-0">
		{#if !mono}<circle cx="12" cy="12" r="10" fill="#fff" />{/if}
		<path
			fill={mono ? 'currentColor' : '#1877f2'}
			d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971H15.83c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
		/>
	</svg>
{:else if source === 'instagram'}
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="shrink-0">
		{#if mono}
			<g fill="none" stroke="currentColor" stroke-width="2">
				<rect x="2" y="2" width="20" height="20" rx="5.5" />
				<circle cx="12" cy="12" r="4.2" />
			</g>
			<circle cx="17.4" cy="6.6" r="1.3" fill="currentColor" />
		{:else}
			<defs>
				<linearGradient id={gradient} x1="0" y1="1" x2="1" y2="0">
					<stop offset="0" stop-color="#feda75" />
					<stop offset="0.3" stop-color="#fa7e1e" />
					<stop offset="0.6" stop-color="#d62976" />
					<stop offset="1" stop-color="#4f5bd5" />
				</linearGradient>
			</defs>
			<rect width="24" height="24" rx="6.5" fill="url(#{gradient})" />
			<g fill="none" stroke="#fff" stroke-width="2">
				<rect x="5" y="5" width="14" height="14" rx="4.2" />
				<circle cx="12" cy="12" r="3.3" />
			</g>
			<circle cx="16.3" cy="7.7" r="1.1" fill="#fff" />
		{/if}
	</svg>
{:else if source === 'google'}
	<svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" class="shrink-0">
		<path
			fill={mono ? 'currentColor' : '#ea4335'}
			d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
		/>
		<path
			fill={mono ? 'currentColor' : '#4285f4'}
			d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
		/>
		<path
			fill={mono ? 'currentColor' : '#fbbc05'}
			d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
		/>
		<path
			fill={mono ? 'currentColor' : '#34a853'}
			d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
		/>
	</svg>
{:else if source === 'wheel'}
	<!-- Колесо фортуни: шість кольорових секторів, як на сайті. -->
	<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="shrink-0">
		{#if mono}
			<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
				<circle cx="12" cy="12" r="10" />
				<path d="M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7" />
			</g>
		{:else}
			{#each WHEEL_SLICES as slice (slice.color)}
				<path d={slice.d} fill={slice.color} />
			{/each}
			<circle cx="12" cy="12" r="2.6" fill="#fff" />
		{/if}
	</svg>
{:else if source === 'direct'}
	<MousePointerClick {size} class="shrink-0 {mono ? '' : 'text-muted-foreground'}" />
{:else}
	<Globe {size} class="shrink-0 {mono ? '' : 'text-muted-foreground'}" />
{/if}
