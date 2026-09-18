-- Порядок варіантів товару (ProductVariant.position у schema.prisma).
--
-- Навіщо: до цієї колонки порядок кольорів ніде не зберігався. CRM читала
-- варіанти за алфавітом (`ORDER BY size, color`), тому набране «Чорний,
-- Білий» після збереження поверталося як «Білий, Чорний», а таблиця розмірів
-- на сайті йшла L, M, S, XS замість XS, S, M, L.
--
-- Застосуйте до Neon:
--   psql "$DATABASE_URL" -f prisma/sql/variant-position.sql
-- або вставте вміст файлу в SQL Editor у консолі Neon.
--
-- Скрипт ідемпотентний: повторний запуск нічого не зламає. Колонка
-- додається зі значенням за замовчуванням, тому наявні рядки не ламаються,
-- а сайт, який про неї не знає, працює як раніше.

ALTER TABLE "ProductVariant"
    ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "ProductVariant_productId_position_idx"
    ON "ProductVariant" ("productId", "position");

-- Розставляння порядку в наявних товарах — окремим кроком, бо потребує шкали
-- розмірів із $lib/sizes: npm run variants:order
