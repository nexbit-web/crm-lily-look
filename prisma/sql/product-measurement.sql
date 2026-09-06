-- Таблиця замірів виробу (модель ProductMeasurement у schema.prisma).
--
-- Застосуйте до Neon перед тим, як користуватись новим блоком у формі товару:
--   psql "$DATABASE_URL" -f prisma/sql/product-measurement.sql
-- або вставте вміст файлу в SQL Editor у консолі Neon.
--
-- Скрипт ідемпотентний: повторний запуск нічого не зламає й не чіпає
-- наявні таблиці магазину.

CREATE TABLE IF NOT EXISTS "ProductMeasurement" (
    "id"        TEXT    NOT NULL,
    "productId" TEXT    NOT NULL,
    "size"      TEXT    NOT NULL,
    "ua"        TEXT,
    "chest"     INTEGER,
    "sleeve"    INTEGER,
    "length"    INTEGER,
    "position"  INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductMeasurement_pkey" PRIMARY KEY ("id")
);

-- Один розмір може зустрітись у товару лише раз.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductMeasurement_productId_size_key"
    ON "ProductMeasurement" ("productId", "size");

CREATE INDEX IF NOT EXISTS "ProductMeasurement_productId_position_idx"
    ON "ProductMeasurement" ("productId", "position");

-- ADD CONSTRAINT не має IF NOT EXISTS, тому ловимо помилку повторного запуску.
DO $$
BEGIN
    ALTER TABLE "ProductMeasurement"
        ADD CONSTRAINT "ProductMeasurement_productId_fkey"
        FOREIGN KEY ("productId") REFERENCES "Product" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Колонка «Під низ» була в першій версії таблиці й виявилась зайвою.
ALTER TABLE "ProductMeasurement" DROP COLUMN IF EXISTS "note";
