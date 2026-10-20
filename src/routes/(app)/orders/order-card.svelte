<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { postAction, succeeded } from '$lib/post-action';
	import type { SubmitFunction } from '@sveltejs/kit';
	import toast from '$lib/toast.svelte';
	import {
		Banknote,
		Gift,
		House,
		ImageOff,
		Mail,
		MapPin,
		MessageSquareText,
		Phone,
		Receipt,
		RotateCcw,
		Ticket,
		Truck,
		User,
		X
	} from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { formatUah } from '$lib/money';
	import { cloudinaryThumb } from '$lib/cloudinary-url';
	import { prizeLabel } from '$lib/wheel';
	import {
		ORDER_STATUSES,
		PAYMENT_STATUSES,
		STATUS_LABELS,
		STATUS_PILLS,
		PAYMENT_LABELS,
		DELIVERY_LABELS,
		type DeliveryMethodKey,
		type OrderStatusKey,
		type PaymentStatusKey
	} from '$lib/orders';
	import { STATUS_ICONS } from './order-icons';
	import StatusBadge from './status-badge.svelte';
	import InfoRow from './info-row.svelte';
	import CarrierIcon from './carrier-icon.svelte';
	import type { Loaded } from '$lib/stream';
	import type { PageData } from './$types';

	type Order = Loaded<PageData>['orders'][number];

	/**
	 * Картка замовлення в стилі ClickUp: широка, у дві колонки. Ліворуч — що
	 * робимо із замовленням (статус, оплата) і кому та куди везти, праворуч —
	 * що замовили й на яку суму.
	 */
	let { open = $bindable(false), order }: { open?: boolean; order: Order | null } = $props();

	const PAYMENT_ICONS: Record<PaymentStatusKey, typeof Banknote> = {
		UNPAID: Receipt,
		PAID: Banknote,
		REFUNDED: RotateCcw
	};

	/** Вибрана оплата: оплачено — зелене, повернено — бурштинове. */
	const PAYMENT_PILLS: Record<PaymentStatusKey, string> = {
		UNPAID: 'bg-foreground text-background',
		PAID: 'bg-emerald-500 text-white',
		REFUNDED: 'bg-amber-500 text-white'
	};

	const choice =
		'inline-flex h-6.5 items-center gap-1.5 rounded-[6px] px-2.5 text-[11px] font-semibold tracking-wide whitespace-nowrap uppercase transition-colors';
	const idle =
		'border border-border text-muted-foreground hover:bg-foreground/5 hover:text-foreground';
	const sectionTitle = 'mb-1.5 text-[12px] font-medium text-muted-foreground';
	const block = 'divide-y divide-border overflow-hidden rounded-[12px] bg-block';
	const row = 'flex items-baseline justify-between gap-4 px-3 py-2 text-[13px]';

	function when(date: Date | string): string {
		return new Date(date).toLocaleString('uk-UA', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	type Snapshot = { id: string; number: string; status: string; payment: string };

	/**
	 * Статус і оплата застосовуються одразу. Тост каже, що змінилось (і чи
	 * підлаштувалась оплата), а «Скасувати» / Ctrl Z повертає як було.
	 */
	const applyChange: SubmitFunction = ({ formData, action }) => {
		const before: Snapshot | null = order
			? { id: order.id, number: order.number, status: order.status, payment: order.paymentStatus }
			: null;
		const isStatus = action.search === '?/status';

		return async ({ result, update }) => {
			if (result.type === 'failure') {
				toast.error(String(result.data?.message ?? 'Не вдалося зберегти'));
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Помилка сервера');
			} else if (result.type === 'success' && before) {
				announce(before, isStatus, formData, result.data?.payment as PaymentStatusKey | null);
			}
			await update({ reset: false });
		};
	};

	function announce(
		before: Snapshot,
		isStatus: boolean,
		formData: FormData,
		autoPayment: PaymentStatusKey | null | undefined
	) {
		const options = { id: `order-change-${before.id}`, subject: before.number };
		if (isStatus) {
			const next = String(formData.get('status')) as OrderStatusKey;
			if (next === before.status) return;
			const payment = autoPayment ? `, оплата — «${PAYMENT_LABELS[autoPayment]}»` : '';
			toast.success('Статус змінено', {
				...options,
				description: ` → «${STATUS_LABELS[next]}»${payment}`,
				undo: () => restore(before, true)
			});
		} else {
			const next = String(formData.get('paymentStatus')) as PaymentStatusKey;
			if (next === before.payment) return;
			toast.success('Оплату змінено', {
				...options,
				description: ` → «${PAYMENT_LABELS[next]}»`,
				undo: () => restore(before, false)
			});
		}
	}

	/** Повертаємо і статус, і оплату: зміна статусу могла підлаштувати й її. */
	async function restore(before: Snapshot, withStatus: boolean) {
		const steps = withStatus
			? [await postAction('/orders?/status', { id: before.id, status: before.status })]
			: [];
		steps.push(
			await postAction('/orders?/payment', { id: before.id, paymentStatus: before.payment })
		);

		if (steps.every(succeeded)) toast.message(`${before.number}: зміну скасовано.`);
		else toast.error('Не вдалося скасувати — оновіть сторінку');
		await invalidateAll();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="flex max-h-[88dvh] flex-col gap-0 overflow-hidden rounded-[16px] border border-border p-0 shadow-2xl ring-0 sm:max-w-220"
	>
		{#if order}
			{@const status = order.status as OrderStatusKey}
			{@const delivery = order.deliveryMethod as DeliveryMethodKey}

			<!-- Шапка: номер, статус, приз; нижче дата й покупець -->
			<header class="flex items-start gap-3 border-b border-border px-5 py-3.5">
				<Dialog.Header class="min-w-0 flex-1 gap-1 text-left">
					<div class="flex flex-wrap items-center gap-2">
						<Dialog.Title class="font-mono text-[17px] font-semibold tracking-tight">
							{order.number}
						</Dialog.Title>
						<StatusBadge {status} />
						{#if order.prize}
							<span
								class="inline-flex h-5.5 items-center gap-1 rounded-[6px] bg-violet/15 px-2 text-[11px] font-semibold tracking-wide text-violet uppercase"
							>
								<Gift size={12} strokeWidth={2.5} />
								Приз: {prizeLabel(order.prize)}
							</span>
						{/if}
					</div>
					<Dialog.Description class="text-[12px]">
						{when(order.createdAt)} · {order.customerName}
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

			<div
				class="grid min-h-0 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
			>
				<!-- Ліва колонка: дії й контакти -->
				<div class="space-y-4">
					<section>
						<h3 class={sectionTitle}>Статус</h3>
						<form
							method="POST"
							action="?/status"
							use:enhance={applyChange}
							class="flex flex-wrap gap-1.5"
						>
							<input type="hidden" name="id" value={order.id} />
							{#each ORDER_STATUSES as key (key)}
								{@const Icon = STATUS_ICONS[key]}
								<button
									type="submit"
									name="status"
									value={key}
									aria-pressed={status === key}
									class="{choice} {status === key ? STATUS_PILLS[key] : idle}"
								>
									<Icon size={13} strokeWidth={2.25} />
									{STATUS_LABELS[key]}
								</button>
							{/each}
						</form>
						<p class="mt-1.5 text-[11px] text-muted-foreground">
							«Доставлене» позначає замовлення оплаченим, «Скасоване» — неоплаченим.
						</p>
					</section>

					<section>
						<h3 class={sectionTitle}>Оплата</h3>
						<form
							method="POST"
							action="?/payment"
							use:enhance={applyChange}
							class="flex flex-wrap gap-1.5"
						>
							<input type="hidden" name="id" value={order.id} />
							{#each PAYMENT_STATUSES as key (key)}
								{@const Icon = PAYMENT_ICONS[key]}
								<button
									type="submit"
									name="paymentStatus"
									value={key}
									aria-pressed={order.paymentStatus === key}
									class="{choice} {order.paymentStatus === key ? PAYMENT_PILLS[key] : idle}"
								>
									<Icon size={13} strokeWidth={2.25} />
									{PAYMENT_LABELS[key]}
								</button>
							{/each}
						</form>
					</section>

					<section>
						<h3 class={sectionTitle}>Покупець</h3>
						<div class={block}>
							<InfoRow icon={User} label="Імʼя">{order.customerName}</InfoRow>
							<InfoRow icon={Phone} label="Телефон">
								<a href="tel:{order.customerPhone}" class="hover:underline">
									{order.customerPhone}
								</a>
							</InfoRow>
							{#if order.customerEmail}
								<InfoRow icon={Mail} label="Пошта">
									<a href="mailto:{order.customerEmail}" class="hover:underline">
										{order.customerEmail}
									</a>
								</InfoRow>
							{/if}
						</div>
					</section>

					<section>
						<h3 class={sectionTitle}>Доставка</h3>
						<div class={block}>
							<InfoRow label="Спосіб">
								{#snippet lead()}<CarrierIcon method={delivery} />{/snippet}
								{DELIVERY_LABELS[delivery]}
							</InfoRow>
							{#if order.deliveryCity}
								<InfoRow icon={MapPin} label="Місто">{order.deliveryCity}</InfoRow>
							{/if}
							{#if order.deliveryAddress}
								<!-- Адреса буває довгою — переноситься, а не обрізається -->
								<div class="flex items-start gap-2.5 px-3 py-2 text-[13px]">
									<House size={15} class="mt-0.5 shrink-0 text-muted-foreground" />
									<span class="w-16 shrink-0 text-muted-foreground">Адреса</span>
									<span class="min-w-0 flex-1 text-right">{order.deliveryAddress}</span>
								</div>
							{/if}
							{#if order.prizeFreeDelivery}
								<div class="flex items-start gap-2.5 px-3 py-2 text-[13px]">
									<Truck size={15} class="mt-0.5 shrink-0 text-violet" />
									<div>
										<p class="font-medium text-violet">Доставку оплачує магазин</p>
										<p class="text-xs text-muted-foreground">У накладній платник — відправник</p>
									</div>
								</div>
							{/if}
						</div>
					</section>

					{#if order.comment}
						<section>
							<h3 class={sectionTitle}>Коментар</h3>
							<div class="flex gap-2.5 rounded-[12px] bg-block px-3 py-2.5 text-[13px]">
								<MessageSquareText size={15} class="mt-0.5 shrink-0 text-muted-foreground" />
								<p class="min-w-0 whitespace-pre-line">{order.comment}</p>
							</div>
						</section>
					{/if}
				</div>

				<!-- Права колонка: що замовили й скільки -->
				<div class="space-y-4">
					<!-- Позиції — знімок на момент замовлення: назва й ціна не змінюються,
					     навіть якщо товар потім перейменували чи видалили. -->
					<section>
						<h3 class={sectionTitle}>
							Товари <span class="tabular-nums opacity-60">{order.items.length}</span>
						</h3>
						<div class={block}>
							{#each order.items as item (item.id)}
								<div class="flex items-center gap-3 px-3 py-2">
									{#if item.imageUrl}
										<img
											src={cloudinaryThumb(item.imageUrl, 80)}
											alt=""
											class="size-10 shrink-0 rounded-[8px] object-cover"
										/>
									{:else}
										<div
											class="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-foreground/6 text-muted-foreground/60"
										>
											<ImageOff size={15} />
										</div>
									{/if}

									<div class="min-w-0 flex-1">
										<p class="truncate text-[13px] font-medium">{item.productName}</p>
										<p class="truncate text-xs text-muted-foreground">
											{item.size} · {item.color} · {item.quantity} × {formatUah(item.unitPrice)}
										</p>
									</div>

									<span class="shrink-0 text-[13px] font-medium tabular-nums">
										{formatUah(item.unitPrice * item.quantity)}
									</span>
								</div>
							{/each}
						</div>
					</section>

					<section>
						<h3 class={sectionTitle}>Сума</h3>
						<div class={block}>
							<div class={row}>
								<span class="text-muted-foreground">Товари</span>
								<span class="tabular-nums">{formatUah(order.subtotal)}</span>
							</div>
							<div class={row}>
								<span class="text-muted-foreground">Доставка</span>
								<span class="tabular-nums">
									{#if order.prizeFreeDelivery}
										Оплачує магазин
									{:else}
										{order.deliveryCost === 0 ? 'За тарифом' : formatUah(order.deliveryCost)}
									{/if}
								</span>
							</div>
							{#if order.prizeDiscount > 0}
								<div class={row}>
									<span class="flex items-center gap-1.5 text-muted-foreground">
										<Ticket size={14} />
										Знижка за приз{order.prize ? ` ${prizeLabel(order.prize)}` : ''}
									</span>
									<span class="text-violet tabular-nums">−{formatUah(order.prizeDiscount)}</span>
								</div>
							{/if}
							<div class="flex items-baseline justify-between gap-4 px-3 py-2.5">
								<span class="text-[13px] font-medium">Разом</span>
								<span class="text-base font-semibold tabular-nums">{formatUah(order.total)}</span>
							</div>
						</div>
					</section>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>
