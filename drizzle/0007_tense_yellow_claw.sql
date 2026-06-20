CREATE TYPE "public"."campaign_company_status" AS ENUM('discovered', 'researched', 'qualified', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."evidence_confidence" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('confirmed_by_prospect', 'researched_fact', 'hypothesis', 'estimate');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('candidate', 'fit', 'not_fit');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"normalized_domain" text NOT NULL,
	"display_domain" text NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "companies_version_positive_check" CHECK ("companies"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "campaign_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"company_id" text NOT NULL,
	"status" "campaign_company_status" NOT NULL,
	"fit_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text NOT NULL,
	"campaign_company_id" text,
	"source_id" text,
	"kind" "evidence_kind" NOT NULL,
	"confidence" "evidence_confidence" NOT NULL,
	"statement" text NOT NULL,
	"assumptions" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "evidence_assumptions_json_array_check" CHECK (jsonb_typeof("evidence"."assumptions") = 'array'),
	CONSTRAINT "evidence_researched_fact_source_check" CHECK ("evidence"."kind" <> 'researched_fact' or "evidence"."source_id" is not null),
	CONSTRAINT "evidence_inferred_assumptions_check" CHECK (case when "evidence"."kind" in ('hypothesis', 'estimate') then case when jsonb_typeof("evidence"."assumptions") = 'array' then jsonb_array_length("evidence"."assumptions") > 0 else false end else true end)
);
--> statement-breakpoint
CREATE TABLE "offer_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"campaign_company_id" text,
	"status" "opportunity_status" NOT NULL,
	"problem" text NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"company_id" text NOT NULL,
	"url" text NOT NULL,
	"source_type" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_workspace_id_unique" ON "campaigns" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_workspace_domain_unique" ON "companies" USING btree ("workspace_id","normalized_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_workspace_id_unique" ON "companies" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "companies_workspace_created_at_id_idx" ON "companies" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_companies_campaign_company_unique" ON "campaign_companies" USING btree ("campaign_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_companies_workspace_id_unique" ON "campaign_companies" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_company_url_unique" ON "sources" USING btree ("company_id","url");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_workspace_id_unique" ON "sources" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "offer_opportunities_company_offer_unique" ON "offer_opportunities" USING btree ("company_id","offer_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD CONSTRAINT "campaign_companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD CONSTRAINT "campaign_companies_workspace_campaign_fk" FOREIGN KEY ("workspace_id","campaign_id") REFERENCES "public"."campaigns"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_companies" ADD CONSTRAINT "campaign_companies_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_campaign_company_fk" FOREIGN KEY ("workspace_id","campaign_company_id") REFERENCES "public"."campaign_companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."sources"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_opportunities" ADD CONSTRAINT "offer_opportunities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_opportunities" ADD CONSTRAINT "offer_opportunities_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_opportunities" ADD CONSTRAINT "offer_opportunities_workspace_offer_fk" FOREIGN KEY ("workspace_id","offer_id") REFERENCES "public"."offers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_opportunities" ADD CONSTRAINT "offer_opportunities_workspace_campaign_company_fk" FOREIGN KEY ("workspace_id","campaign_company_id") REFERENCES "public"."campaign_companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;
