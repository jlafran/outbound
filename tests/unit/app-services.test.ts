import { describe, expect, it, vi } from "vitest";

import { createResearchCampaignDryRunProjection } from "@/features/campaigns/campaign-projections";
import type { DossierRepository } from "@/features/dossiers/dossier-repository";
import { createMemoryResearchRepository } from "@/features/research/research-repository";
import { scoreCompany } from "@/features/research/score-company";

describe("persistent campaign dry-run projection", () => {
  it("serves generated campaign data from persisted research and dossier state", async () => {
    const researchRepository = createMemoryResearchRepository();
    const score = scoreCompany({
      capacityToPay: 90,
      problemMagnitude: 90,
      urgency: 90,
      solutionFit: 90,
      decisionMakerAccess: 80,
      evidenceConfidence: 80,
    });
    await researchRepository.persistCampaignResearch({
      workspaceId: "workspace-1",
      campaignId: "campaign-1",
      offerId: "offer-1",
      companies: [
        {
          companyId: "company-1",
          campaignCompanyId: "campaign-company-1",
          name: "Acme",
          domain: "acme.com",
          contacts: [
            {
              name: "Ada Lovelace",
              role: "CEO",
              corporateEmail: "ada@acme.com",
            },
          ],
          evidence: [
            {
              kind: "researched_fact",
              statement: "Acme vende software B2B.",
              sourceUrl: "https://example.com/acme",
              observedAt: new Date("2026-06-20T12:00:00.000Z"),
              confidence: "high",
              assumptions: [],
            },
          ],
          score,
        },
      ],
    });
    const dossierRepository = {
      async getLatest() {
        return { id: "dossier-1" };
      },
    } as unknown as DossierRepository;
    const projection = createResearchCampaignDryRunProjection(
      researchRepository,
      dossierRepository,
    );
    const create = vi.fn();

    await expect(
      projection.get("workspace-1", "campaign-1"),
    ).resolves.toMatchObject({
      campaignId: "campaign-1",
      dossierId: "dossier-1",
      companies: [
        {
          campaignCompanyId: "campaign-company-1",
          score,
        },
      ],
    });
    await expect(
      projection.getOrCreate("workspace-1", "campaign-1", create),
    ).resolves.toMatchObject({ dossierId: "dossier-1" });
    expect(create).not.toHaveBeenCalled();
  });
});
