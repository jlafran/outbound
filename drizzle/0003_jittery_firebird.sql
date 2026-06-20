DROP INDEX "audit_events_workspace_listing_idx";--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_listing_idx" ON "audit_events" USING btree ("workspace_id","sequence");