ALTER TABLE "campaigns" ADD COLUMN "target_ticket_band" "offer_ticket_band";--> statement-breakpoint
UPDATE "campaigns"
SET "target_ticket_band" = "offers"."ticket_band"
FROM "offers"
WHERE "campaigns"."workspace_id" = "offers"."workspace_id"
  AND "campaigns"."offer_id" = "offers"."id";--> statement-breakpoint
ALTER TABLE "campaigns" ALTER COLUMN "target_ticket_band" SET NOT NULL;
