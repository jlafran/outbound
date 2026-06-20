CREATE TYPE "public"."offer_ticket_band" AS ENUM('usd_5k_15k', 'usd_15k_plus');--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"raw_text" text NOT NULL,
	"problems" jsonb NOT NULL,
	"expected_results" jsonb NOT NULL,
	"ticket_band" "offer_ticket_band" NOT NULL,
	"allowed_pilot" text NOT NULL,
	"prohibited_claims" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_workspace_creator_member_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."workspace_members"("workspace_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offers_workspace_created_at_idx" ON "offers" USING btree ("workspace_id","created_at");