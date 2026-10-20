# CRM LILY LOOK

Внутрішня CRM магазину: замовлення, товари, категорії, знижки, статистика,
відвідуваність сайту, співробітники й Telegram-бот. SvelteKit + Prisma (Neon),
кеш у Redis (Upstash), нові замовлення в реальному часі через Pusher.

## Розробка

```sh
npm install
cp .env.example .env   # і заповнити
npm run dev            # http://localhost:5173
```

Першого співробітника (публічної реєстрації немає):

```sh
npm run user:create -- --email admin@lilylook.ua --password "Secret123" --name "Аня" --role ADMIN
```

## Перевірки

```sh
npm test           # усі тести, без мережі й бази (~15 с)
npm run test:redis # живий тест Redis із .env: кеш, скидання, позначки сесій
npm run check      # типи
npm run lint       # prettier + eslint
```

Що саме покривають тести — у [tests/README.md](tests/README.md).

## Деплой на Vercel

Проєкт уже налаштований: `@sveltejs/adapter-vercel`, Node 22, функції в
регіоні **fra1** (Франкфурт) — там само, де Neon і Upstash (`eu-central-1`).

1. **Імпорт.** Vercel → Add New → Project → репозиторій. Framework Preset
   визначиться сам (SvelteKit). Build Command, Output — типові.
2. **Змінні.** Settings → Environment Variables → Production — усе з
   [.env.example](.env.example):
   - `DATABASE_URL` — рядок **Pooled connection** з Neon (хост із `-pooler`);
   - `BETTER_AUTH_SECRET` — новий, `openssl rand -base64 32`;
   - `BETTER_AUTH_URL` — адреса CRM, напр. `https://crm-lily-look.vercel.app`
     (після підключення свого домену — його);
   - `CLOUDINARY_*`, `UPSTASH_REDIS_REST_*`, `PUSHER_*`, `CRM_HOOK_SECRET`.
3. **Deploy.** Збірка сама згенерує клієнт Prisma (`prisma generate` у
   `npm run build`). Міграцій CRM не запускає — схемою бази керує сайт.
4. **Сайт.** Після кожного нового замовлення сайт має викликати вебхук — тоді
   CRM покаже сповіщення без перезавантаження:

   ```js
   await fetch('https://<адреса CRM>/api/hooks/orders', {
   	method: 'POST',
   	headers: {
   		'content-type': 'application/json',
   		authorization: `Bearer ${process.env.CRM_HOOK_SECRET}`
   	},
   	body: JSON.stringify({ id: order.id }) // або { number: order.number }
   }).catch(() => {}); // CRM недоступна — замовлення однаково збережене
   ```

### Після деплою перевірити

- `/login` відкривається, вхід працює, сайдбар показує лічильник замовлень;
- в іншій вкладці змінити статус замовлення — перша оновиться сама (Pusher);
- Vercel → Logs: немає `[redis] недоступний` (інакше кеш вимкнений і кожен
  перегляд іде в базу) і немає `Base URL is not set` (не задано `BETTER_AUTH_URL`).

### Як CRM береже базу

Neon на безкоштовному тарифі засинає без запитів і прокидається повільно, тож:

- **сесія** — з підписаної cookie (5 хв), без запиту в базу на кожен клік.
  Зміна ролі чи видалення співробітника діють одразу: позначка в Redis змушує
  перечитати саме його сесію;
- **сторінки** — з Redis: категорії, знижки, підказки — до доби; товари й
  статистика — 5 хв; відвідуваність — 2 хв; замовлення й лічильник — 30 с.
  Будь-яке збереження в CRM скидає кеш свого розділу одразу, вебхук сайту —
  кеш замовлень;
- **у фоні** CRM нічого не опитує: нові замовлення приходять подією Pusher.
  Відкрита, але неактивна вкладка базу не будить.

Redis не налаштований чи впав — CRM працює напряму з базою, лише повільніше.
