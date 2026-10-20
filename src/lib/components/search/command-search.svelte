<script lang="ts">
	import { tick, untrack, type Component } from 'svelte';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { goto } from '$app/navigation';
	import { toggleMode } from 'mode-watcher';
	import {
		ChevronLeft,
		ChevronRight,
		Clock,
		ExternalLink,
		FolderTree,
		Gift,
		ImageOff,
		Inbox,
		LayoutGrid,
		Package,
		Palette,
		Plus,
		SearchX,
		Shirt,
		SunMoon
	} from '@lucide/svelte';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import { formatUah } from '$lib/money';
	import { navFor, SETTINGS, type NavItem } from '$lib/nav';
	import { STATUS_DOTS, STATUS_LABELS, type OrderStatusKey } from '$lib/orders';
	import {
		highlight,
		SCOPE_LABELS,
		SEARCH_SCOPES,
		type SearchResults,
		type SearchScope
	} from '$lib/search';

	/**
	 * Пошук по всій CRM у стилі ClickUp: широка темна модалка одразу під
	 * шапкою, великий рядок вводу, вкладки-розділи з підкресленням, результати
	 * групами, команди й нещодавні, порада внизу.
	 *
	 * Клавіші: ↑↓ — вибір, Enter — відкрити, Tab — наступна вкладка, Esc —
	 * закрити. Відкривається з шапки або з будь-якого місця через Ctrl K.
	 */
	let { open = $bindable(false), role }: { open: boolean; role: string } = $props();

	let query = $state('');
	let scope = $state<SearchScope>('all');
	let results = $state<SearchResults | null>(null);
	let loading = $state(false);
	let failed = $state(false);
	let active = $state(0);
	let input = $state<HTMLInputElement | null>(null);
	let list = $state<HTMLDivElement | null>(null);

	/** Скільки чекати після останньої літери, перш ніж питати сервер. */
	const DEBOUNCE_MS = 160;

	type Kind = 'product' | 'order' | 'category' | 'page' | 'command';
	type Row = {
		key: string;
		kind: Kind;
		title: string;
		/** Сірий хвостик після назви: «· у Сукні». */
		meta?: string;
		/** Праворуч: ціна, сума, дата. */
		aside?: string;
		href?: string;
		/** Зовнішнє посилання — відкриваємо в новій вкладці. */
		external?: boolean;
		/** Команда без переходу (перемкнути тему). */
		run?: () => void;
		image?: string | null;
		icon?: Component;
		/** Крапка статусу замовлення. */
		dot?: string;
	};
	type Section = { key: string; title: string; rows: Row[] };

	const SCOPE_ICONS: Record<SearchScope, Component | null> = {
		all: null,
		products: Shirt,
		orders: Package,
		categories: FolderTree,
		pages: LayoutGrid
	};

	const term = $derived(query.trim());
	const pages = $derived([...navFor(role), SETTINGS]);

	// ── Команди ──────────────────────────────────────────────────────────────
	// Швидкі дії, які інакше вимагали б кількох кліків. Шукаються за назвою
	// й підказкою, як у ClickUp («Open Notepad · notepad»).
	const COMMANDS: (Row & { keywords: string })[] = [
		{
			key: 'cmd:new-product',
			kind: 'command',
			title: 'Додати товар',
			meta: 'новий товар',
			href: '/products/new',
			icon: Plus,
			keywords: 'створити товар'
		},
		{
			key: 'cmd:new-orders',
			kind: 'command',
			title: 'Нові замовлення',
			meta: 'статус «Нове»',
			href: '/orders?status=NEW',
			icon: Inbox,
			keywords: 'замовлення нові необроблені'
		},
		{
			key: 'cmd:prize-orders',
			kind: 'command',
			title: 'Замовлення з призом колеса',
			meta: 'колесо фортуни',
			href: '/orders?prize=1',
			icon: Gift,
			keywords: 'приз колесо'
		},
		{
			key: 'cmd:toggle-theme',
			kind: 'command',
			title: 'Перемкнути тему',
			meta: 'світла / темна',
			run: toggleMode,
			icon: SunMoon,
			keywords: 'тема темна світла режим'
		},
		{
			key: 'cmd:accent',
			kind: 'command',
			title: 'Колір теми',
			meta: 'налаштування',
			href: '/settings',
			icon: Palette,
			keywords: 'колір сайдбар налаштування'
		},
		{
			key: 'cmd:site',
			kind: 'command',
			title: 'Відкрити сайт',
			meta: 'lilylook.store',
			href: 'https://lilylook.store',
			external: true,
			icon: ExternalLink,
			keywords: 'сайт магазин вітрина'
		}
	];

	function matches(text: string): boolean {
		return text.toLowerCase().includes(term.toLowerCase());
	}

	function pageRow(item: NavItem): Row {
		return {
			key: `page:${item.href}`,
			kind: 'page',
			href: item.href,
			title: item.label,
			icon: item.icon
		};
	}

	function when(iso: string): string {
		return new Date(iso).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
	}

	// ── Нещодавні ────────────────────────────────────────────────────────────
	// Що відкривали через пошук — лише в цьому браузері. Сховище може бути
	// недоступне (приватне вікно) — тоді просто без нещодавніх.
	const RECENT_KEY = 'crm:search:recent';
	const RECENT_LIMIT = 5;
	type Recent = Pick<Row, 'key' | 'kind' | 'title' | 'meta' | 'href' | 'image' | 'dot'>;
	let recent = $state<Recent[]>([]);

	function loadRecent() {
		try {
			const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
			recent = Array.isArray(raw) ? raw.slice(0, RECENT_LIMIT) : [];
		} catch {
			recent = [];
		}
	}

	function remember(row: Row) {
		if (row.kind === 'command' || row.kind === 'page' || !row.href) return;
		const entry: Recent = {
			key: row.key,
			kind: row.kind,
			title: row.title,
			meta: row.meta,
			href: row.href,
			image: row.image,
			dot: row.dot
		};
		recent = [entry, ...recent.filter((item) => item.key !== row.key)].slice(0, RECENT_LIMIT);
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
		} catch {
			// Немає сховища — нещодавні просто не запамʼятаються.
		}
	}

	const KIND_ICONS: Record<Kind, Component> = {
		product: Shirt,
		order: Package,
		category: FolderTree,
		page: LayoutGrid,
		command: Plus
	};

	// ── Секції ───────────────────────────────────────────────────────────────
	const sections = $derived.by((): Section[] => {
		const found: Section[] = [];
		const wants = (group: SearchScope) => scope === 'all' || scope === group;
		const commandsHere = scope === 'all' || scope === 'pages';

		// Без запиту — нещодавні, швидкий перехід і команди, як у ClickUp.
		if (term.length < 2) {
			if (scope === 'all' && recent.length) {
				found.push({
					key: 'recent',
					title: 'Нещодавні',
					rows: recent.map((item) => ({ ...item, icon: KIND_ICONS[item.kind] }))
				});
			}
			if (wants('pages'))
				found.push({ key: 'pages', title: 'Перейти до', rows: pages.map(pageRow) });
			if (commandsHere) found.push({ key: 'commands', title: 'Команди', rows: COMMANDS });
			return found;
		}

		if (results && wants('products') && results.products.length) {
			found.push({
				key: 'products',
				title: 'Товари',
				rows: results.products.map((item) => ({
					key: `product:${item.id}`,
					kind: 'product',
					href: `/products/${item.id}`,
					title: item.name,
					meta: [item.category ? `у ${item.category}` : null, item.isActive ? null : 'прихований']
						.filter(Boolean)
						.join(' · '),
					aside: formatUah(item.price),
					image: item.image
				}))
			});
		}
		if (results && wants('orders') && results.orders.length) {
			found.push({
				key: 'orders',
				title: 'Замовлення',
				rows: results.orders.map((item) => ({
					key: `order:${item.id}`,
					kind: 'order',
					// Окремої сторінки замовлення немає — список сам відкриє картку.
					href: `/orders?q=${encodeURIComponent(item.number)}&open=${item.id}`,
					title: `${item.number} · ${item.customer}`,
					meta: `${STATUS_LABELS[item.status as OrderStatusKey] ?? item.status} · ${formatUah(item.total)}`,
					aside: when(item.createdAt),
					icon: Package,
					dot: STATUS_DOTS[item.status as OrderStatusKey]
				}))
			});
		}
		if (results && wants('categories') && results.categories.length) {
			found.push({
				key: 'categories',
				title: 'Категорії',
				rows: results.categories.map((item) => ({
					key: `category:${item.id}`,
					kind: 'category',
					href: `/products?category=${item.id}`,
					title: item.name,
					meta: item.parent ? `у ${item.parent}` : undefined,
					aside: `${item.products} тов.`,
					icon: FolderTree
				}))
			});
		}
		if (wants('pages')) {
			const matched = pages.filter((item) => matches(`${item.label} ${item.keywords ?? ''}`));
			if (matched.length)
				found.push({ key: 'pages', title: 'Розділи', rows: matched.map(pageRow) });
		}
		if (commandsHere) {
			const matched = COMMANDS.filter((item) =>
				matches(`${item.title} ${item.meta ?? ''} ${item.keywords}`)
			);
			if (matched.length) found.push({ key: 'commands', title: 'Команди', rows: matched });
		}
		return found;
	});

	const rows = $derived(sections.flatMap((section) => section.rows));

	/** Кількість у вкладці — видно, де шукати, ще не перемикаючись. */
	function countFor(group: SearchScope): number | null {
		if (term.length < 2 || group === 'all') return null;
		if (group === 'pages') {
			return pages.filter((item) => matches(`${item.label} ${item.keywords ?? ''}`)).length;
		}
		return results ? results[group].length : null;
	}

	// Запит до сервера: з паузою після останньої літери, попередній скасовуємо —
	// інакше стара відповідь могла б прийти пізніше й перезаписати нову.
	$effect(() => {
		const q = term;
		const group = scope;
		if (!open || q.length < 2 || group === 'pages') {
			loading = false;
			return;
		}

		const controller = new AbortController();
		const timer = setTimeout(async () => {
			loading = true;
			failed = false;
			try {
				const params = new URLSearchParams({ q, scope: group });
				const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
				if (!response.ok) throw new Error(String(response.status));
				results = await response.json();
			} catch (err) {
				if (controller.signal.aborted) return;
				failed = true;
				console.warn('[search]', err);
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, DEBOUNCE_MS);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// Новий список — вибір знову на першому рядку.
	$effect(() => {
		void rows;
		active = 0;
	});

	// Вибраний рядок завжди в полі зору, навіть у довгому списку.
	$effect(() => {
		const index = active;
		list?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
	});

	// Кожне відкриття — з чистого аркуша, хоч би звідки відкрили: шапка, Ctrl K.
	$effect(() => {
		if (open) untrack(reset);
	});

	function reset() {
		query = '';
		scope = 'all';
		results = null;
		failed = false;
		active = 0;
		loadRecent();
	}

	async function choose(row: Row | undefined) {
		if (!row) return;
		remember(row);
		open = false;
		if (row.run) row.run();
		else if (row.external && row.href) window.open(row.href, '_blank', 'noopener');
		else if (row.href) await goto(row.href);
	}

	function cycleScope(delta: number) {
		const index = SEARCH_SCOPES.indexOf(scope);
		scope = SEARCH_SCOPES[(index + delta + SEARCH_SCOPES.length) % SEARCH_SCOPES.length];
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = rows.length ? (active + 1) % rows.length : 0;
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = rows.length ? (active - 1 + rows.length) % rows.length : 0;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(rows[active]);
		} else if (event.key === 'Tab') {
			event.preventDefault();
			cycleScope(event.shiftKey ? -1 : 1);
		}
	}

	// ── Порада внизу ─────────────────────────────────────────────────────────
	const TIPS = [
		'Tab перемикає вкладки, ↑↓ — вибір, Enter — відкрити',
		'Замовлення шукаються за номером, імʼям і телефоном',
		'Товари — за назвою, адресою на сайті й артикулом',
		'Ctrl K відкриває пошук із будь-якої сторінки',
		'Напишіть «тема», щоб швидко перемкнути світлу й темну'
	];
	let tip = $state(0);
</script>

{#snippet kbd(label: string)}
	<kbd
		class="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border px-1 font-sans text-[11px] font-medium text-muted-foreground"
	>
		{label}
	</kbd>
{/snippet}

<DialogPrimitive.Root bind:open>
	<DialogPrimitive.Portal>
		<DialogPrimitive.Overlay
			class="fixed inset-0 z-50 bg-black/20 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:bg-black/50"
		/>
		<DialogPrimitive.Content
			onOpenAutoFocus={async (event) => {
				event.preventDefault();
				await tick();
				input?.focus();
			}}
			class="fixed top-12 left-1/2 z-50 flex max-h-[min(640px,calc(100dvh-64px))] w-[calc(100%-24px)] max-w-225 -translate-x-1/2 flex-col overflow-hidden rounded-[14px] border border-border bg-popover text-popover-foreground shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35),0_4px_16px_rgba(0,0,0,0.1)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
		>
			<DialogPrimitive.Title class="sr-only">Пошук по CRM</DialogPrimitive.Title>

			<!-- Рядок вводу: великий, без рамки, як у ClickUp -->
			<div class="flex h-14 shrink-0 items-center gap-3 px-5">
				<input
					bind:this={input}
					bind:value={query}
					{onkeydown}
					type="search"
					placeholder="Шукайте товари, замовлення, категорії або команду…"
					aria-label="Пошук"
					autocomplete="off"
					spellcheck="false"
					class="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden"
				/>
				{#if loading}
					<Spinner class="size-4 shrink-0 text-muted-foreground" />
				{/if}
				<DialogPrimitive.Close
					class="flex h-7 shrink-0 items-center rounded-[8px] border border-border px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
					aria-label="Закрити"
				>
					Esc
				</DialogPrimitive.Close>
			</div>

			<!-- Вкладки-розділи: вибрана — жирна з підкресленням -->
			<div
				class="flex shrink-0 scrollbar-none items-center gap-5 overflow-x-auto border-b border-border px-5"
				role="tablist"
				aria-label="Де шукати"
			>
				{#each SEARCH_SCOPES as group (group)}
					{@const selected = scope === group}
					{@const count = countFor(group)}
					{@const Icon = SCOPE_ICONS[group]}
					<button
						type="button"
						role="tab"
						aria-selected={selected}
						class="relative flex h-10 shrink-0 items-center gap-1.5 text-[13px] transition-colors {selected
							? 'font-semibold text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground'
							: 'font-medium text-muted-foreground hover:text-foreground'}"
						onclick={() => {
							scope = group;
							input?.focus();
						}}
					>
						{#if Icon}<Icon size={15} />{/if}
						{SCOPE_LABELS[group]}
						{#if count !== null}
							<span class="text-[11px] font-normal tabular-nums opacity-60">{count}</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Результати -->
			<div bind:this={list} class="min-h-0 flex-1 overflow-y-auto px-2 py-1.5" role="listbox">
				{#if rows.length === 0 && loading && !failed}
					<!-- Перші результати ще летять — рядки-скелетони замість «Шукаю…». -->
					<div class="pb-1" aria-busy="true" aria-label="Шукаю">
						<span class="mx-3 mt-3 mb-2 block h-2.5 w-16 skeleton rounded-full"></span>
						{#each [62, 48, 74, 55, 68] as width, index (index)}
							<div class="flex h-11 items-center gap-3 px-3" style:opacity={1 - index * 0.15}>
								<span class="size-6 shrink-0 skeleton rounded-[6px]"></span>
								<span class="h-3 skeleton rounded-full" style:width="{width}%"></span>
								<span class="ml-auto h-3 w-14 skeleton rounded-full"></span>
							</div>
						{/each}
					</div>
				{:else if rows.length === 0}
					<div class="flex flex-col items-center gap-2 px-6 py-14 text-center">
						<SearchX size={24} class="text-muted-foreground/50" />
						<p class="text-sm text-muted-foreground">
							{#if failed}
								Пошук зараз недоступний. Спробуйте ще раз.
							{:else if loading}
								Шукаю…
							{:else}
								Нічого не знайдено за «{term}»
								{#if scope !== 'all'}у розділі «{SCOPE_LABELS[scope]}»{/if}
							{/if}
						</p>
					</div>
				{:else}
					{#each sections as section (section.key)}
						{@const offset = rows.indexOf(section.rows[0])}
						<div class="pb-1">
							<p class="px-3 pt-2.5 pb-1 text-[12px] font-medium text-muted-foreground">
								{section.title}
							</p>
							{#each section.rows as row, i (row.key)}
								{@const index = offset + i}
								{@const selected = index === active}
								<a
									href={row.href ?? '#'}
									data-index={index}
									role="option"
									aria-selected={selected}
									class="flex h-11 items-center gap-3 rounded-[8px] px-3 outline-none {selected
										? 'bg-foreground/7'
										: ''}"
									onmousemove={() => (active = index)}
									onclick={(event) => {
										event.preventDefault();
										choose(row);
									}}
								>
									{#if row.image !== undefined}
										{#if row.image}
											<img
												src={cloudinaryThumb(row.image, 48)}
												alt=""
												class="size-6 shrink-0 rounded-[6px] bg-foreground/5 object-cover"
											/>
										{:else}
											<span
												class="flex size-6 shrink-0 items-center justify-center rounded-[6px] bg-foreground/5 text-muted-foreground/60"
											>
												<ImageOff size={12} />
											</span>
										{/if}
									{:else if row.icon}
										<span
											class="relative flex size-6 shrink-0 items-center justify-center text-muted-foreground"
										>
											<row.icon size={17} />
											{#if row.dot}
												<span
													class="absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-popover {row.dot}"
												></span>
											{/if}
										</span>
									{/if}

									<!-- Назва й сірий хвостик в один рядок, як у ClickUp -->
									<span class="flex min-w-0 flex-1 items-baseline gap-1.5 text-[14px]">
										<span class="truncate">
											{#each highlight(row.title, term) as part, p (p)}
												{#if part.match}
													<mark class="bg-transparent font-semibold text-foreground"
														>{part.text}</mark
													>
												{:else}
													{part.text}
												{/if}
											{/each}
										</span>
										{#if row.meta}
											<span class="shrink-0 text-muted-foreground/70">·</span>
											<span class="truncate text-[13px] text-muted-foreground">{row.meta}</span>
										{/if}
									</span>

									{#if row.aside}
										<span class="shrink-0 text-[12px] text-muted-foreground tabular-nums">
											{row.aside}
										</span>
									{:else if section.key === 'recent'}
										<Clock size={13} class="shrink-0 text-muted-foreground/60" />
									{:else if selected}
										{@render kbd('↵')}
									{/if}
								</a>
							{/each}
						</div>
					{/each}
				{/if}
			</div>

			<!-- Порада внизу, гортається стрілками -->
			<div
				class="flex h-11 shrink-0 items-center gap-2 border-t border-border px-4 text-[12px] text-muted-foreground"
			>
				<button
					type="button"
					aria-label="Попередня порада"
					class="flex size-6 items-center justify-center rounded-full hover:bg-foreground/6 hover:text-foreground"
					onclick={() => (tip = (tip - 1 + TIPS.length) % TIPS.length)}
				>
					<ChevronLeft size={14} />
				</button>
				<button
					type="button"
					aria-label="Наступна порада"
					class="flex size-6 items-center justify-center rounded-full hover:bg-foreground/6 hover:text-foreground"
					onclick={() => (tip = (tip + 1) % TIPS.length)}
				>
					<ChevronRight size={14} />
				</button>
				<span class="truncate">Порада — {TIPS[tip]}</span>
				<span class="ml-auto hidden items-center gap-1.5 sm:flex">
					{@render kbd('↑')}{@render kbd('↓')}
					<span class="mr-1.5">вибрати</span>
					{@render kbd('↵')}
					<span>відкрити</span>
				</span>
			</div>
		</DialogPrimitive.Content>
	</DialogPrimitive.Portal>
</DialogPrimitive.Root>
