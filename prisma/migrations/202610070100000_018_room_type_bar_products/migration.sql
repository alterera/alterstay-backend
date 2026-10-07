-- Room-type BAR + derived rate products (OYO/Fab-style)

CREATE TABLE "public"."room_type_daily_rates" (
    "id" UUID NOT NULL,
    "roomTypeId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "minStay" INTEGER,
    "maxStay" INTEGER,
    "closedToArrival" BOOLEAN NOT NULL DEFAULT false,
    "closedToDeparture" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "room_type_daily_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "room_type_daily_rates_roomTypeId_date_key"
  ON "public"."room_type_daily_rates"("roomTypeId", "date");
CREATE INDEX "room_type_daily_rates_date_idx"
  ON "public"."room_type_daily_rates"("date");

ALTER TABLE "public"."room_type_daily_rates"
  ADD CONSTRAINT "room_type_daily_rates_roomTypeId_fkey"
  FOREIGN KEY ("roomTypeId") REFERENCES "public"."room_types"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."rate_plans" ADD COLUMN "productCode" TEXT;

CREATE UNIQUE INDEX "rate_plans_roomTypeId_productCode_key"
  ON "public"."rate_plans"("roomTypeId", "productCode");

-- Seed non-refundable cancellation policy for derived products
INSERT INTO "public"."cancellation_policies" ("id", "name", "description")
VALUES (
  '00000000-0000-4000-8000-000000000020',
  'Non-refundable',
  'No cancellation or modification after booking. Full prepayment required.'
)
ON CONFLICT ("name") DO NOTHING;

-- Migrate existing per-plan BAR to room-type BAR (minimum price per room type per date)
INSERT INTO "public"."room_type_daily_rates" (
  "id", "roomTypeId", "date", "basePrice", "currency",
  "minStay", "maxStay", "closedToArrival", "closedToDeparture"
)
SELECT
  gen_random_uuid(),
  rp."roomTypeId",
  rpr."date",
  MIN(rpr."basePrice"),
  COALESCE(MIN(rpr."currency"), 'INR'),
  MIN(rpr."minStay"),
  MIN(rpr."maxStay"),
  BOOL_OR(rpr."closedToArrival"),
  BOOL_OR(rpr."closedToDeparture")
FROM "public"."rate_prices" rpr
JOIN "public"."rate_plans" rp ON rp."id" = rpr."ratePlanId"
GROUP BY rp."roomTypeId", rpr."date"
ON CONFLICT ("roomTypeId", "date") DO NOTHING;
