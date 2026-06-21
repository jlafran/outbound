ALTER TABLE "dossiers" DROP CONSTRAINT "dossiers_workspace_previous_version_fk";
--> statement-breakpoint
ALTER TABLE "dossiers" ADD COLUMN "previous_version" integer;--> statement-breakpoint
UPDATE "dossiers"
SET "previous_version" = "version" - 1
WHERE "version" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "dossiers_version_chain_target_unique" ON "dossiers" USING btree ("workspace_id","campaign_company_id","id","version");--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_version_chain_fk" FOREIGN KEY ("workspace_id","campaign_company_id","previous_version_id","previous_version") REFERENCES "public"."dossiers"("workspace_id","campaign_company_id","id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dossiers" ADD CONSTRAINT "dossiers_version_chain_check" CHECK (("dossiers"."version" = 1 and "dossiers"."previous_version_id" is null and "dossiers"."previous_version" is null) or ("dossiers"."version" > 1 and "dossiers"."previous_version_id" is not null and "dossiers"."previous_version" is not null and "dossiers"."previous_version" = "dossiers"."version" - 1));--> statement-breakpoint
CREATE FUNCTION "prevent_dossier_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'dossiers are append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "dossiers_append_only_trigger"
BEFORE UPDATE OR DELETE ON "dossiers"
FOR EACH ROW
EXECUTE FUNCTION "prevent_dossier_mutation"();
