CREATE TABLE "dossiers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_company_id" text NOT NULL,
	"meeting_id" text,
	"version" integer NOT NULL,
	"previous_version_id" text,
	"executive_summary" text NOT NULL,
	"company_overview" text NOT NULL,
	"business_model" text NOT NULL,
	"contacts" jsonb NOT NULL,
	"conversation_summary" text NOT NULL,
	"confirmed_needs" jsonb NOT NULL,
	"researched_facts" jsonb NOT NULL,
	"hypotheses" jsonb NOT NULL,
	"estimates" jsonb NOT NULL,
	"competitors" jsonb NOT NULL,
	"recommendations" jsonb NOT NULL,
	"pending_questions" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "dossiers_version_positive_check" CHECK ("dossiers"."version" > 0),
	CONSTRAINT "dossiers_contacts_json_array_check" CHECK (jsonb_typeof("dossiers"."contacts") = 'array'),
	CONSTRAINT "dossiers_confirmed_needs_json_array_check" CHECK (jsonb_typeof("dossiers"."confirmed_needs") = 'array'),
	CONSTRAINT "dossiers_researched_facts_json_array_check" CHECK (jsonb_typeof("dossiers"."researched_facts") = 'array'),
	CONSTRAINT "dossiers_hypotheses_json_array_check" CHECK (jsonb_typeof("dossiers"."hypotheses") = 'array'),
	CONSTRAINT "dossiers_estimates_json_array_check" CHECK (jsonb_typeof("dossiers"."estimates") = 'array'),
	CONSTRAINT "dossiers_competitors_json_array_check" CHECK (jsonb_typeof("dossiers"."competitors") = 'array'),
	CONSTRAINT "dossiers_recommendations_json_array_check" CHECK (jsonb_typeof("dossiers"."recommendations") = 'array'),
	CONSTRAINT "dossiers_pending_questions_json_array_check" CHECK (jsonb_typeof("dossiers"."pending_questions") = 'array')
);
--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_workspace_campaign_company_fk" FOREIGN KEY ("workspace_id","campaign_company_id") REFERENCES "public"."campaign_companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_workspace_creator_member_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_workspace_previous_version_fk" FOREIGN KEY ("workspace_id","previous_version_id") REFERENCES "public"."dossiers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dossiers_workspace_id_unique" ON "dossiers" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "dossiers_workspace_company_version_unique" ON "dossiers" USING btree ("workspace_id","campaign_company_id","version");--> statement-breakpoint
CREATE INDEX "dossiers_latest_idx" ON "dossiers" USING btree ("workspace_id","campaign_company_id","version" desc,"id");