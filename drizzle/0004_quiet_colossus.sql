CREATE TYPE "public"."campaign_paid_data_mode" AS ENUM('free', 'paid', 'fallback');--> statement-breakpoint
CREATE TYPE "public"."campaign_state" AS ENUM('draft', 'niche_review', 'discovery_ready', 'researching', 'message_review', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"created_by" text NOT NULL,
	"name" text NOT NULL,
	"target_daily_emails" integer NOT NULL,
	"paid_data_mode" "campaign_paid_data_mode" NOT NULL,
	"state" "campaign_state" NOT NULL,
	"niche_recommendation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_niche_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "campaigns_target_daily_emails_check" CHECK ("campaigns"."target_daily_emails" between 1 and 200),
	CONSTRAINT "campaigns_niche_recommendation_ids_json_array_check" CHECK (jsonb_typeof("campaigns"."niche_recommendation_ids") = 'array'),
	CONSTRAINT "campaigns_approved_niche_ids_json_array_check" CHECK (jsonb_typeof("campaigns"."approved_niche_ids") = 'array'),
	CONSTRAINT "campaigns_version_positive_check" CHECK ("campaigns"."version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "offers_workspace_id_id_unique" ON "offers" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_creator_member_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspace_offer_fk" FOREIGN KEY ("workspace_id","offer_id") REFERENCES "public"."offers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_workspace_created_at_id_idx" ON "campaigns" USING btree ("workspace_id","created_at","id");
