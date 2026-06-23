CREATE TABLE "company_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text NOT NULL,
	"campaign_company_id" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"corporate_email" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD COLUMN "score_total" double precision;--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD COLUMN "score_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_workspace_campaign_company_fk" FOREIGN KEY ("workspace_id","company_id","campaign_company_id") REFERENCES "public"."campaign_companies"("workspace_id","company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_contacts_company_email_unique" ON "company_contacts" USING btree ("company_id","corporate_email");--> statement-breakpoint
CREATE UNIQUE INDEX "company_contacts_workspace_id_unique" ON "company_contacts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "company_contacts_workspace_company_idx" ON "company_contacts" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "company_contacts_workspace_campaign_company_idx" ON "company_contacts" USING btree ("workspace_id","campaign_company_id");