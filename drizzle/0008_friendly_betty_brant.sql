ALTER TABLE "evidence" DROP CONSTRAINT "evidence_workspace_campaign_company_fk";
--> statement-breakpoint
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_workspace_source_fk";
--> statement-breakpoint
ALTER TABLE "offer_opportunities" DROP CONSTRAINT "offer_opportunities_workspace_campaign_company_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_companies_workspace_company_id_unique" ON "campaign_companies" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_workspace_company_id_unique" ON "sources" USING btree ("workspace_id","company_id","id");--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_campaign_company_fk" FOREIGN KEY ("workspace_id","company_id","campaign_company_id") REFERENCES "public"."campaign_companies"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_source_fk" FOREIGN KEY ("workspace_id","company_id","source_id") REFERENCES "public"."sources"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_opportunities" ADD CONSTRAINT "offer_opportunities_workspace_campaign_company_fk" FOREIGN KEY ("workspace_id","company_id","campaign_company_id") REFERENCES "public"."campaign_companies"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evidence_workspace_company_idx" ON "evidence" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "evidence_workspace_source_idx" ON "evidence" USING btree ("workspace_id","source_id");--> statement-breakpoint
CREATE INDEX "evidence_workspace_campaign_company_idx" ON "evidence" USING btree ("workspace_id","campaign_company_id");--> statement-breakpoint
CREATE INDEX "offer_opportunities_workspace_offer_idx" ON "offer_opportunities" USING btree ("workspace_id","offer_id");--> statement-breakpoint
CREATE INDEX "offer_opportunities_workspace_campaign_company_idx" ON "offer_opportunities" USING btree ("workspace_id","campaign_company_id");
