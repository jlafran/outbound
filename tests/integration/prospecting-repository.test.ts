import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";

import {
  createDrizzleProspectingRepository,
  type ProspectingDbExecutor,
} from "@/features/prospecting/prospecting-repository";
import type { DentalAestheticsProspectingResult } from "@/features/prospecting/dental-prospecting-service";

async function createDatabase() {
  const client = new PGlite();
  await client.waitReady;
  for (const name of readdirSync(join(process.cwd(), "drizzle"))
    .filter((value) => /^\d{4}_.+\.sql$/.test(value))
    .sort()) {
    await client.exec(
      readFileSync(join(process.cwd(), "drizzle", name), "utf8").replaceAll(
        "--> statement-breakpoint",
        "",
      ),
    );
  }
  await client.exec(`
    insert into users (id, email, name) values
      ('user-1', 'owner@example.com', 'Owner');
    insert into workspaces (id, name) values
      ('workspace-1', 'Workspace One'),
      ('workspace-2', 'Workspace Two');
    insert into workspace_members (workspace_id, user_id, role) values
      ('workspace-1', 'user-1', 'owner'),
      ('workspace-2', 'user-1', 'owner');
    insert into offers (
      id, workspace_id, name, raw_text, problems, expected_results,
      ticket_band, allowed_pilot, prohibited_claims, version, created_at,
      created_by
    ) values
      ('offer-1', 'workspace-1', 'Offer', 'Raw', '[]', '[]',
       'usd_5k_15k', 'Pilot', '[]', 1, now(), 'user-1'),
      ('offer-2', 'workspace-2', 'Offer', 'Raw', '[]', '[]',
       'usd_5k_15k', 'Pilot', '[]', 1, now(), 'user-1');
    insert into campaigns (
      id, workspace_id, offer_id, created_by, name, target_daily_emails,
      paid_data_mode, target_ticket_band, state, niche_recommendation_ids,
      approved_niche_ids, version, created_at, updated_at
    ) values
      ('campaign-1', 'workspace-1', 'offer-1', 'user-1', 'Campaign', 20,
       'free', 'usd_5k_15k', 'discovery_ready', '["niche"]', '["niche"]',
       1, now(), now()),
      ('campaign-2', 'workspace-2', 'offer-2', 'user-1', 'Campaign', 20,
       'free', 'usd_5k_15k', 'discovery_ready', '["niche"]', '["niche"]',
       1, now(), now());
  `);
  return { client, database: drizzle(client) };
}

const result: DentalAestheticsProspectingResult = {
  leads: [
    {
      companyName: "Clínica Uno",
      domain: "clinicauno.com.ar",
      websiteUrl: "https://clinicauno.com.ar",
      status: "review",
      score: 75,
      decisionMakers: [],
      contacts: {
        emails: [],
        phones: [],
        whatsapps: [],
        emailCandidates: [
          {
            email: "ana@clinicauno.com.ar",
            source: "pattern",
            verificationStatus: "pending",
            verificationProvider: "no2bounce",
            verificationTrackingId: "track-1",
          },
        ],
      },
      opportunitySignals: [],
      evidence: [],
      websiteResearch: {
        status: "completed",
        pages: [
          {
            requestedUrl: "https://clinicauno.com.ar/equipo",
            finalUrl: "https://clinicauno.com.ar/equipo",
            status: "fetched",
          },
        ],
        contacts: {
          emails: ["ana@clinicauno.com.ar"],
          phones: [],
          whatsapps: [],
          linkedinUrls: [],
          instagramUrls: [],
        },
        people: [],
        services: ["Implantes"],
        signals: [],
        errors: [],
      },
      scoreBreakdown: {
        total: 75,
        components: {
          companyValidation: 20,
          offerFit: 15,
          decisionMaker: 20,
          directChannel: 15,
          verifiedEmail: 0,
          opportunitySignal: 0,
          sourceQuality: 5,
        },
        penalties: [],
        reasons: [],
      },
      recommendedContact: null,
      messageDraft: null,
    },
  ],
  unassociatedDecisionMakers: [],
  rejected: [],
};

describe("createDrizzleProspectingRepository", () => {
  it("persists a run and synchronizes refreshed verification state into its snapshot", async () => {
    const { client, database } = await createDatabase();
    const repository = createDrizzleProspectingRepository(
      database as unknown as ProspectingDbExecutor,
    );
    const startedAt = new Date("2026-06-26T18:00:00.000Z");
    const completedAt = new Date("2026-06-26T18:01:00.000Z");

    try {
      await repository.startRun({
        id: "run-1",
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        profile: "dental_aesthetics_ar",
        startedAt,
      });
      await repository.completeRun({
        workspaceId: "workspace-1",
        campaignId: "campaign-1",
        runId: "run-1",
        result,
        completedAt,
      });

      await expect(
        repository.getLatestCompletedRun("workspace-2", "campaign-1"),
      ).resolves.toBeNull();
      await expect(
        repository.listPendingVerifications("workspace-1", "run-1"),
      ).resolves.toEqual([
        expect.objectContaining({
          email: "ana@clinicauno.com.ar",
          providerTrackingId: "track-1",
        }),
      ]);

      const [pending] = await repository.listPendingVerifications(
        "workspace-1",
        "run-1",
      );
      await repository.updateVerification({
        workspaceId: "workspace-1",
        runId: "run-1",
        verificationId: pending.id,
        status: "valid",
        checkedAt: new Date("2026-06-26T18:02:00.000Z"),
      });

      const run = await repository.getLatestCompletedRun(
        "workspace-1",
        "campaign-1",
      );
      expect(run?.resultSnapshot?.leads[0].contacts.emailCandidates[0])
        .toMatchObject({ verificationStatus: "valid" });
      expect(run?.resultSnapshot?.leads[0].websiteResearch).toMatchObject({
        status: "completed",
        services: ["Implantes"],
      });
      await expect(
        repository.listPendingVerifications("workspace-1", "run-1"),
      ).resolves.toEqual([]);
    } finally {
      await client.close();
    }
  });
});
