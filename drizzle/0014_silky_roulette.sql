CREATE TYPE "public"."prospecting_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."prospecting_verification_status" AS ENUM('unverified', 'valid', 'risky', 'invalid', 'pending', 'unknown');--> statement-breakpoint
CREATE TABLE "prospecting_email_verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"run_id" text NOT NULL,
	"lead_domain" text NOT NULL,
	"email" text NOT NULL,
	"source" text NOT NULL,
	"provider" text,
	"status" "prospecting_verification_status" NOT NULL,
	"provider_tracking_id" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "prospecting_verifications_source_check" CHECK ("prospecting_email_verifications"."source" in ('pattern', 'public', 'hunter', 'reacher')),
	CONSTRAINT "prospecting_verifications_provider_check" CHECK ("prospecting_email_verifications"."provider" is null or "prospecting_email_verifications"."provider" in ('no2bounce', 'reacher')),
	CONSTRAINT "prospecting_verifications_pending_tracking_check" CHECK ("prospecting_email_verifications"."status" <> 'pending' or "prospecting_email_verifications"."provider_tracking_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "prospecting_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"profile" text NOT NULL,
	"status" "prospecting_run_status" NOT NULL,
	"result_snapshot" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "prospecting_runs_result_status_check" CHECK (case when "prospecting_runs"."status" = 'completed' then "prospecting_runs"."result_snapshot" is not null and "prospecting_runs"."completed_at" is not null else true end)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "prospecting_runs_workspace_id_unique" ON "prospecting_runs" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "prospecting_email_verifications" ADD CONSTRAINT "prospecting_email_verifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospecting_email_verifications" ADD CONSTRAINT "prospecting_verifications_workspace_campaign_fk" FOREIGN KEY ("workspace_id","campaign_id") REFERENCES "public"."campaigns"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospecting_email_verifications" ADD CONSTRAINT "prospecting_verifications_workspace_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."prospecting_runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospecting_runs" ADD CONSTRAINT "prospecting_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospecting_runs" ADD CONSTRAINT "prospecting_runs_workspace_campaign_fk" FOREIGN KEY ("workspace_id","campaign_id") REFERENCES "public"."campaigns"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prospecting_verifications_run_domain_email_unique" ON "prospecting_email_verifications" USING btree ("run_id","lead_domain","email");--> statement-breakpoint
CREATE INDEX "prospecting_verifications_pending_idx" ON "prospecting_email_verifications" USING btree ("workspace_id","campaign_id","run_id") WHERE "prospecting_email_verifications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "prospecting_runs_workspace_campaign_latest_idx" ON "prospecting_runs" USING btree ("workspace_id","campaign_id","created_at","id");--> statement-breakpoint
ALTER TABLE "prospecting_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "prospecting_email_verifications" ENABLE ROW LEVEL SECURITY;
