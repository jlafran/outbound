DROP INDEX "offers_workspace_created_at_idx";--> statement-breakpoint
CREATE INDEX "offers_workspace_created_at_idx" ON "offers" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_version_1_check" CHECK ("offers"."version" = 1);--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_problems_json_array_check" CHECK (jsonb_typeof("offers"."problems") = 'array');--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_expected_results_json_array_check" CHECK (jsonb_typeof("offers"."expected_results") = 'array');--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_prohibited_claims_json_array_check" CHECK (jsonb_typeof("offers"."prohibited_claims") = 'array');