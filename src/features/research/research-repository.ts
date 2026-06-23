import { and, count, eq, asc } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import {
  campaignCompanies,
  companies,
  companyContacts,
  evidence as evidenceTable,
  offerOpportunities,
  sources,
} from "@/db/schema";

import type { Evidence } from "./research-schema";
import type { ResearchCompany, ResearchContact } from "./research-provider";
import type { ScoreCompanyResult } from "./score-company";

export type ResearchOpportunityMaterial = {
  id: string;
  workspaceId: string;
  companyId: string;
  offerId: string;
  campaignCompanyId: string;
  status: "candidate" | "fit" | "not_fit";
  problem: string;
  rationale: string;
};

export type CampaignCompanyMaterial = ResearchCompany & {
  opportunities: ResearchOpportunityMaterial[];
};

export type PersistCampaignResearchInput = {
  workspaceId: string;
  campaignId: string;
  offerId?: string;
  companies: ResearchCompany[];
};

export type CampaignCompanyIdentity = {
  workspaceId: string;
  campaignCompanyId: string;
};

export interface ResearchRepository {
  persistCampaignResearch(input: PersistCampaignResearchInput): Promise<void>;
  listCampaignCompaniesMaterial(input: {
    workspaceId: string;
    campaignId: string;
  }): Promise<CampaignCompanyMaterial[]>;
  getCampaignCompanyMaterial(
    identity: CampaignCompanyIdentity,
  ): Promise<CampaignCompanyMaterial | null>;
  countCampaignCompanies(workspaceId?: string): Promise<number>;
  countContacts(workspaceId?: string): Promise<number>;
  countSources(workspaceId?: string): Promise<number>;
  countEvidence(workspaceId?: string): Promise<number>;
  countOfferOpportunities(workspaceId?: string): Promise<number>;
}

export type ResearchDbExecutor = Pick<
  typeof applicationDb,
  "insert" | "select"
>;

type CampaignCompanyRecord = {
  id: string;
  workspaceId: string;
  campaignId: string;
  companyId: string;
  name: string;
  domain: string;
  status: "researched";
  fitReason: string;
  scoreTotal: number;
  scoreSnapshot: ScoreCompanyResult;
};

type ContactRecord = ResearchContact & {
  id: string;
  workspaceId: string;
  companyId: string;
  campaignCompanyId: string;
};

type SourceRecord = {
  id: string;
  workspaceId: string;
  companyId: string;
  url: string;
  sourceType: string;
  observedAt: Date;
};

type EvidenceRecord = Evidence & {
  id: string;
  workspaceId: string;
  companyId: string;
  campaignCompanyId: string;
  sourceId: string;
};

function countByWorkspace<T extends { workspaceId: string }>(
  records: Iterable<T>,
  workspaceId?: string,
): number {
  return [...records].filter(
    (record) =>
      workspaceId === undefined || record.workspaceId === workspaceId,
  ).length;
}

function cloneMaterial<T>(value: T): T {
  return structuredClone(value);
}

export type ResearchRepositoryDependencies = {
  now: () => Date;
};

export function createDrizzleResearchRepository(
  database: ResearchDbExecutor,
  dependencies: ResearchRepositoryDependencies = { now: () => new Date() },
): ResearchRepository {
  return {
    async persistCampaignResearch(input) {
      const now = dependencies.now();

      for (const company of input.companies) {
        await database
          .insert(campaignCompanies)
          .values({
            id: company.campaignCompanyId,
            workspaceId: input.workspaceId,
            campaignId: input.campaignId,
            companyId: company.companyId,
            status: "researched",
            fitReason: company.score.explanation,
            scoreTotal: company.score.total,
            scoreSnapshot: company.score,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              campaignCompanies.campaignId,
              campaignCompanies.companyId,
            ],
            set: {
              status: "researched",
              fitReason: company.score.explanation,
              scoreTotal: company.score.total,
              scoreSnapshot: company.score,
              updatedAt: now,
            },
          });

        for (const [index, contact] of company.contacts.entries()) {
          await database
            .insert(companyContacts)
            .values({
              id: `${company.campaignCompanyId}:contact:${index + 1}`,
              workspaceId: input.workspaceId,
              companyId: company.companyId,
              campaignCompanyId: company.campaignCompanyId,
              name: contact.name,
              role: contact.role,
              corporateEmail: contact.corporateEmail,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                companyContacts.companyId,
                companyContacts.corporateEmail,
              ],
              set: {
                name: contact.name,
                role: contact.role,
                updatedAt: now,
              },
            });
        }

        for (const [index, item] of company.evidence.entries()) {
          const sourceId = `${company.campaignCompanyId}:source:${index + 1}`;
          const sourceUrl = item.sourceUrl ?? "";

          const [source] = await database
            .insert(sources)
            .values({
              id: sourceId,
              workspaceId: input.workspaceId,
              companyId: company.companyId,
              url: sourceUrl,
              sourceType: "dry_run",
              observedAt: item.observedAt,
              createdAt: now,
            })
            .onConflictDoUpdate({
              target: [sources.companyId, sources.url],
              set: {
                observedAt: item.observedAt,
              },
            })
            .returning({ id: sources.id });
          const persistedSourceId = source?.id ?? sourceId;

          await database
            .insert(evidenceTable)
            .values({
              id: `${company.campaignCompanyId}:evidence:${index + 1}`,
              workspaceId: input.workspaceId,
              companyId: company.companyId,
              campaignCompanyId: company.campaignCompanyId,
              sourceId: persistedSourceId,
              kind: item.kind,
              confidence: item.confidence,
              statement: item.statement,
              assumptions: item.assumptions,
              observedAt: item.observedAt,
              createdAt: now,
            })
            .onConflictDoUpdate({
              target: evidenceTable.id,
              set: {
                sourceId: persistedSourceId,
                kind: item.kind,
                confidence: item.confidence,
                statement: item.statement,
                assumptions: item.assumptions,
                observedAt: item.observedAt,
              },
            });
        }

        if (input.offerId) {
          const problem =
            company.evidence.find((item) => item.kind === "hypothesis")
              ?.statement ?? company.score.explanation;

          await database
            .insert(offerOpportunities)
            .values({
              id: `${company.campaignCompanyId}:opportunity:${input.offerId}`,
              workspaceId: input.workspaceId,
              companyId: company.companyId,
              offerId: input.offerId,
              campaignCompanyId: company.campaignCompanyId,
              status: "candidate",
              problem,
              rationale: company.score.explanation,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                offerOpportunities.companyId,
                offerOpportunities.offerId,
              ],
              set: {
                status: "candidate",
                problem,
                rationale: company.score.explanation,
                updatedAt: now,
              },
            });
        }
      }
    },
    async listCampaignCompaniesMaterial({ workspaceId, campaignId }) {
      const rows = await database
        .select()
        .from(campaignCompanies)
        .where(
          and(
            eq(campaignCompanies.workspaceId, workspaceId),
            eq(campaignCompanies.campaignId, campaignId),
          ),
        )
        .orderBy(asc(campaignCompanies.id));
      const materials = await Promise.all(
        rows.map((row) =>
          this.getCampaignCompanyMaterial({
            workspaceId,
            campaignCompanyId: row.id,
          }),
        ),
      );

      return materials
        .filter((material): material is CampaignCompanyMaterial =>
          Boolean(material),
        )
        .sort(
          (left, right) =>
            right.score.total - left.score.total ||
            left.domain.localeCompare(right.domain),
        );
    },
    async getCampaignCompanyMaterial({ workspaceId, campaignCompanyId }) {
      const [campaignCompany] = await database
        .select()
        .from(campaignCompanies)
        .where(
          and(
            eq(campaignCompanies.workspaceId, workspaceId),
            eq(campaignCompanies.id, campaignCompanyId),
          ),
        )
        .limit(1);

      if (!campaignCompany?.scoreSnapshot) {
        return null;
      }

      const [company] = await database
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            eq(companies.id, campaignCompany.companyId),
          ),
        )
        .limit(1);

      if (!company) {
        return null;
      }

      const contactRows = await database
        .select()
        .from(companyContacts)
        .where(
          and(
            eq(companyContacts.workspaceId, workspaceId),
            eq(companyContacts.companyId, campaignCompany.companyId),
          ),
        )
        .orderBy(asc(companyContacts.id));

      const sourceRows = await database
        .select()
        .from(sources)
        .where(
          and(
            eq(sources.workspaceId, workspaceId),
            eq(sources.companyId, campaignCompany.companyId),
          ),
        );
      const sourceUrlById = new Map(
        sourceRows.map((source) => [source.id, source.url]),
      );

      const evidenceRows = await database
        .select()
        .from(evidenceTable)
        .where(
          and(
            eq(evidenceTable.workspaceId, workspaceId),
            eq(evidenceTable.campaignCompanyId, campaignCompany.id),
          ),
        )
        .orderBy(asc(evidenceTable.id));

      const opportunityRows = await database
        .select()
        .from(offerOpportunities)
        .where(
          and(
            eq(offerOpportunities.workspaceId, workspaceId),
            eq(offerOpportunities.companyId, campaignCompany.companyId),
          ),
        )
        .orderBy(asc(offerOpportunities.id));

      return cloneMaterial({
        companyId: company.id,
        campaignCompanyId: campaignCompany.id,
        name: company.name,
        domain: company.normalizedDomain,
        contacts: contactRows.map((contact) => ({
          name: contact.name,
          role: contact.role,
          corporateEmail: contact.corporateEmail,
        })),
        evidence: evidenceRows.map((item) => ({
          kind: item.kind,
          statement: item.statement,
          sourceUrl: item.sourceId
            ? sourceUrlById.get(item.sourceId)
            : undefined,
          observedAt: item.observedAt,
          confidence: item.confidence,
          assumptions: item.assumptions,
        })),
        score: campaignCompany.scoreSnapshot,
        opportunities: opportunityRows.map((opportunity) => ({
          id: opportunity.id,
          workspaceId: opportunity.workspaceId,
          companyId: opportunity.companyId,
          offerId: opportunity.offerId,
          campaignCompanyId: opportunity.campaignCompanyId ?? "",
          status: opportunity.status,
          problem: opportunity.problem,
          rationale: opportunity.rationale,
        })),
      });
    },
    async countCampaignCompanies(workspaceId) {
      const query = database
        .select({ value: count() })
        .from(campaignCompanies);
      const rows =
        workspaceId === undefined
          ? await query
          : await query.where(eq(campaignCompanies.workspaceId, workspaceId));

      return rows[0]?.value ?? 0;
    },
    async countContacts(workspaceId) {
      const query = database.select({ value: count() }).from(companyContacts);
      const rows =
        workspaceId === undefined
          ? await query
          : await query.where(eq(companyContacts.workspaceId, workspaceId));

      return rows[0]?.value ?? 0;
    },
    async countSources(workspaceId) {
      const query = database.select({ value: count() }).from(sources);
      const rows =
        workspaceId === undefined
          ? await query
          : await query.where(eq(sources.workspaceId, workspaceId));

      return rows[0]?.value ?? 0;
    },
    async countEvidence(workspaceId) {
      const query = database.select({ value: count() }).from(evidenceTable);
      const rows =
        workspaceId === undefined
          ? await query
          : await query.where(eq(evidenceTable.workspaceId, workspaceId));

      return rows[0]?.value ?? 0;
    },
    async countOfferOpportunities(workspaceId) {
      const query = database
        .select({ value: count() })
        .from(offerOpportunities);
      const rows =
        workspaceId === undefined
          ? await query
          : await query.where(eq(offerOpportunities.workspaceId, workspaceId));

      return rows[0]?.value ?? 0;
    },
  };
}

export function createMemoryResearchRepository(): ResearchRepository {
  const campaignCompanies = new Map<string, CampaignCompanyRecord>();
  const contacts = new Map<string, ContactRecord>();
  const sources = new Map<string, SourceRecord>();
  const evidence = new Map<string, EvidenceRecord>();
  const opportunities = new Map<string, ResearchOpportunityMaterial>();

  return {
    async persistCampaignResearch(input) {
      for (const company of input.companies) {
        campaignCompanies.set(company.campaignCompanyId, {
          id: company.campaignCompanyId,
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          companyId: company.companyId,
          name: company.name,
          domain: company.domain,
          status: "researched",
          fitReason: company.score.explanation,
          scoreTotal: company.score.total,
          scoreSnapshot: cloneMaterial(company.score),
        });

        company.contacts.forEach((contact, index) => {
          contacts.set(
            `${input.workspaceId}:${company.companyId}:${contact.corporateEmail}`,
            {
              id: `${company.campaignCompanyId}:contact:${index + 1}`,
              workspaceId: input.workspaceId,
              companyId: company.companyId,
              campaignCompanyId: company.campaignCompanyId,
              ...cloneMaterial(contact),
            },
          );
        });

        company.evidence.forEach((item, index) => {
          const sourceId = `${company.campaignCompanyId}:source:${index + 1}`;
          const sourceKey = `${input.workspaceId}:${company.companyId}:${item.sourceUrl ?? ""}`;
          const existingSource = sources.get(sourceKey);
          const persistedSourceId = existingSource?.id ?? sourceId;
          sources.set(sourceKey, {
            id: persistedSourceId,
            workspaceId: input.workspaceId,
            companyId: company.companyId,
            url: item.sourceUrl ?? "",
            sourceType: "dry_run",
            observedAt: new Date(item.observedAt),
          });
          evidence.set(`${company.campaignCompanyId}:evidence:${index + 1}`, {
            id: `${company.campaignCompanyId}:evidence:${index + 1}`,
            workspaceId: input.workspaceId,
            companyId: company.companyId,
            campaignCompanyId: company.campaignCompanyId,
            sourceId: persistedSourceId,
            ...cloneMaterial(item),
          });
        });

        if (input.offerId) {
          const problem =
            company.evidence.find((item) => item.kind === "hypothesis")
              ?.statement ?? company.score.explanation;
          opportunities.set(
            `${input.workspaceId}:${company.companyId}:${input.offerId}`,
            {
              id: `${company.campaignCompanyId}:opportunity:${input.offerId}`,
              workspaceId: input.workspaceId,
              companyId: company.companyId,
              offerId: input.offerId,
              campaignCompanyId: company.campaignCompanyId,
              status: "candidate",
              problem,
              rationale: company.score.explanation,
            },
          );
        }
      }
    },
    async listCampaignCompaniesMaterial({ workspaceId, campaignId }) {
      const rows = [...campaignCompanies.values()]
        .filter(
          (record) =>
            record.workspaceId === workspaceId &&
            record.campaignId === campaignId,
        )
        .sort(
          (left, right) =>
            right.scoreTotal - left.scoreTotal ||
            left.domain.localeCompare(right.domain),
        );
      const materials = await Promise.all(
        rows.map((record) =>
          this.getCampaignCompanyMaterial({
            workspaceId,
            campaignCompanyId: record.id,
          }),
        ),
      );

      return materials.filter(
        (material): material is CampaignCompanyMaterial =>
          Boolean(material),
      );
    },
    async getCampaignCompanyMaterial({ workspaceId, campaignCompanyId }) {
      const campaignCompany = campaignCompanies.get(campaignCompanyId);
      if (!campaignCompany || campaignCompany.workspaceId !== workspaceId) {
        return null;
      }

      const material: CampaignCompanyMaterial = {
        companyId: campaignCompany.companyId,
        campaignCompanyId: campaignCompany.id,
        name: campaignCompany.name,
        domain: campaignCompany.domain,
        contacts: [...contacts.values()]
          .filter(
            (contact) =>
              contact.workspaceId === workspaceId &&
              contact.companyId === campaignCompany.companyId,
          )
          .map((contact) => ({
            name: contact.name,
            role: contact.role,
            corporateEmail: contact.corporateEmail,
          })),
        evidence: [...evidence.values()]
          .filter(
            (item) =>
              item.workspaceId === workspaceId &&
              item.campaignCompanyId === campaignCompany.id,
          )
          .map((item) => ({
            kind: item.kind,
            statement: item.statement,
            sourceUrl: item.sourceUrl,
            observedAt: item.observedAt,
            confidence: item.confidence,
            assumptions: item.assumptions,
          })),
        score: cloneMaterial(campaignCompany.scoreSnapshot),
        opportunities: [...opportunities.values()].filter(
          (opportunity) =>
            opportunity.workspaceId === workspaceId &&
            opportunity.companyId === campaignCompany.companyId,
        ),
      };

      return cloneMaterial(material);
    },
    async countCampaignCompanies(workspaceId) {
      return countByWorkspace(campaignCompanies.values(), workspaceId);
    },
    async countContacts(workspaceId) {
      return countByWorkspace(contacts.values(), workspaceId);
    },
    async countSources(workspaceId) {
      return countByWorkspace(sources.values(), workspaceId);
    },
    async countEvidence(workspaceId) {
      return countByWorkspace(evidence.values(), workspaceId);
    },
    async countOfferOpportunities(workspaceId) {
      return countByWorkspace(opportunities.values(), workspaceId);
    },
  };
}
