import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createMemoryCompanyRepository,
  type CompanyRepository,
} from "@/features/companies/company-repository";
import { FakeResearchProvider } from "@/features/research/fake-research-provider";
import { createMemoryResearchRepository } from "@/features/research/research-repository";
import { evidenceSchema } from "@/features/research/research-schema";
import {
  scoreCompany,
  type ScoreCompanyInput,
} from "@/features/research/score-company";

const input = {
  workspaceId: "workspace-1",
  campaignId: "campaign-1",
};

const expectedCompanies = [
  {
    name: "Logística Pampa",
    domain: "logistica-pampa.example.com",
    scoreInput: {
      capacityToPay: 82,
      problemMagnitude: 91,
      urgency: 88,
      solutionFit: 90,
      decisionMakerAccess: 76,
      evidenceConfidence: 84,
    },
  },
  {
    name: "Nexo B2B Sistemas",
    domain: "nexo-b2b.example.com",
    scoreInput: {
      capacityToPay: 86,
      problemMagnitude: 83,
      urgency: 79,
      solutionFit: 92,
      decisionMakerAccess: 85,
      evidenceConfidence: 81,
    },
  },
  {
    name: "Salud Privada del Plata",
    domain: "salud-del-plata.example.com",
    scoreInput: {
      capacityToPay: 88,
      problemMagnitude: 89,
      urgency: 86,
      solutionFit: 78,
      decisionMakerAccess: 68,
      evidenceConfidence: 79,
    },
  },
] satisfies {
  name: string;
  domain: string;
  scoreInput: ScoreCompanyInput;
}[];

describe("FakeResearchProvider", () => {
  it("returns exactly three fictional Argentine companies for the target segments", async () => {
    const provider = new FakeResearchProvider(
      createMemoryCompanyRepository(),
    );

    const result = await provider.researchCampaign(input);

    expect(result.companies).toHaveLength(3);
    expect(
      result.companies.map(({ name, domain }) => ({ name, domain })),
    ).toEqual(
      expectedCompanies.map(({ name, domain }) => ({ name, domain })),
    );
  });

  it("returns one valid trimmed corporate contact per company", async () => {
    const result = await new FakeResearchProvider(
      createMemoryCompanyRepository(),
    ).researchCampaign(input);
    const emailSchema = z.string().email();

    for (const company of result.companies) {
      expect(company.contacts).toHaveLength(1);
      const [contact] = company.contacts;

      expect(contact.name).toBe(contact.name.trim());
      expect(contact.name).not.toBe("");
      expect(contact.role).toBe(contact.role.trim());
      expect(contact.role).not.toBe("");
      expect(emailSchema.parse(contact.corporateEmail)).toBe(
        contact.corporateEmail,
      );
      expect(contact.corporateEmail.split("@").at(-1)).toBe(
        company.domain,
      );
    }
  });

  it("returns the required sourced evidence mix with explicit assumptions", async () => {
    const result = await new FakeResearchProvider(
      createMemoryCompanyRepository(),
    ).researchCampaign(input);

    for (const company of result.companies) {
      expect(company.evidence).toHaveLength(4);
      expect(
        company.evidence.map(({ kind }) => kind).sort(),
      ).toEqual(
        ["estimate", "hypothesis", "researched_fact", "researched_fact"].sort(),
      );

      for (const item of company.evidence) {
        expect(evidenceSchema.parse(item)).toEqual(item);
        expect(item.sourceUrl).toMatch(/^https:\/\/example\.com\//);
        if (item.kind === "researched_fact") {
          expect(["high", "medium"]).toContain(item.confidence);
        }
        if (item.kind === "hypothesis" || item.kind === "estimate") {
          expect(item.assumptions.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("scores every fixture only through the shared scoreCompany calculation", async () => {
    const result = await new FakeResearchProvider(
      createMemoryCompanyRepository(),
    ).researchCampaign(input);

    expect(result.companies.map(({ score }) => score)).toEqual(
      expectedCompanies.map(({ scoreInput }) => scoreCompany(scoreInput)),
    );
    expect(
      result.companies.every(({ score }) => score.total >= 0),
    ).toBe(true);
  });

  it("reuses company and dry-run campaign-company ids on repeated runs", async () => {
    const repository = createMemoryCompanyRepository();
    const provider = new FakeResearchProvider(repository);

    const first = await provider.researchCampaign(input);
    const second = await provider.researchCampaign(input);

    expect(second).toEqual(first);
    expect(
      second.companies.map(({ companyId }) => companyId),
    ).toEqual(first.companies.map(({ companyId }) => companyId));
    expect(
      second.companies.map(({ campaignCompanyId }) => campaignCompanyId),
    ).toEqual(
      first.companies.map(({ campaignCompanyId }) => campaignCompanyId),
    );
    expect(
      second.companies.every(({ campaignCompanyId }) =>
        campaignCompanyId.startsWith("dry-run:"),
      ),
    ).toBe(true);
    expect(await repository.count(input.workspaceId)).toBe(3);
  });

  it("persists reusable research artifacts idempotently when a research repository is provided", async () => {
    const companyRepository = createMemoryCompanyRepository();
    const researchRepository = createMemoryResearchRepository();
    const provider = new FakeResearchProvider(
      companyRepository,
      researchRepository,
    );
    const campaignInput = { ...input, offerId: "offer-1" };

    const first = await provider.researchCampaign(campaignInput);
    const second = await provider.researchCampaign(campaignInput);

    expect(second).toEqual(first);
    expect(
      await researchRepository.countCampaignCompanies(input.workspaceId),
    ).toBe(3);
    expect(await researchRepository.countContacts(input.workspaceId)).toBe(3);
    expect(await researchRepository.countSources(input.workspaceId)).toBe(12);
    expect(await researchRepository.countEvidence(input.workspaceId)).toBe(12);
    expect(
      await researchRepository.countOfferOpportunities(input.workspaceId),
    ).toBe(3);

    const topCompany = await researchRepository.getCampaignCompanyMaterial({
      workspaceId: input.workspaceId,
      campaignCompanyId: first.companies[0].campaignCompanyId,
    });

    expect(topCompany).toMatchObject({
      companyId: first.companies[0].companyId,
      campaignCompanyId: first.companies[0].campaignCompanyId,
      name: first.companies[0].name,
      domain: first.companies[0].domain,
      score: first.companies[0].score,
      contacts: first.companies[0].contacts,
      evidence: first.companies[0].evidence,
      opportunities: [
        expect.objectContaining({
          offerId: "offer-1",
          campaignCompanyId: first.companies[0].campaignCompanyId,
          status: "candidate",
        }),
      ],
    });
  });

  it("does not leak caller mutations into later calls", async () => {
    const provider = new FakeResearchProvider(
      createMemoryCompanyRepository(),
    );
    const first = await provider.researchCampaign(input);

    first.companies[0].name = "Mutated";
    first.companies[0].contacts[0].role = "Mutated";
    first.companies[0].evidence[0].observedAt.setUTCFullYear(1999);
    first.companies.push(structuredClone(first.companies[0]));

    const second = await provider.researchCampaign(input);

    expect(second.companies).toHaveLength(3);
    expect(second.companies[0].name).toBe("Logística Pampa");
    expect(second.companies[0].contacts[0].role).not.toBe("Mutated");
    expect(second.companies[0].evidence[0].observedAt.toISOString()).toBe(
      "2026-06-20T12:00:00.000Z",
    );
  });

  it("isolates persisted companies and generated ids by workspace", async () => {
    const repository = createMemoryCompanyRepository();
    const provider = new FakeResearchProvider(repository);

    const first = await provider.researchCampaign(input);
    const second = await provider.researchCampaign({
      ...input,
      workspaceId: "workspace-2",
    });

    expect(
      new Set([
        ...first.companies.map(({ companyId }) => companyId),
        ...second.companies.map(({ companyId }) => companyId),
      ]),
    ).toHaveLength(6);
    expect(
      second.companies.map(({ campaignCompanyId }) => campaignCompanyId),
    ).not.toEqual(
      first.companies.map(({ campaignCompanyId }) => campaignCompanyId),
    );
    expect(await repository.count("workspace-1")).toBe(3);
    expect(await repository.count("workspace-2")).toBe(3);
    expect(await repository.count()).toBe(6);
  });

  it("propagates repository failures and keeps no hidden partial state", async () => {
    const memory = createMemoryCompanyRepository();
    let attempts = 0;
    let failOnce = true;
    const repository: CompanyRepository = {
      ...memory,
      async upsertByDomain(companyInput) {
        attempts += 1;
        if (failOnce && attempts === 2) {
          failOnce = false;
          throw new Error("repository unavailable");
        }
        return memory.upsertByDomain(companyInput);
      },
    };
    const provider = new FakeResearchProvider(repository);

    await expect(provider.researchCampaign(input)).rejects.toThrow(
      "repository unavailable",
    );
    expect(await memory.count(input.workspaceId)).toBe(1);

    const recovered = await provider.researchCampaign(input);

    expect(recovered.companies).toHaveLength(3);
    expect(await memory.count(input.workspaceId)).toBe(3);
  });
});
