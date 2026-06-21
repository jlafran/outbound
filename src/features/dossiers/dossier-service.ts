import { z } from "zod";

import type { JsonValue } from "@/features/audit/audit-repository";

import {
  DossierError,
  type DossierRepository,
} from "./dossier-repository";
import {
  dossierEditableContentSchema,
  dossierEvidenceItemSchema,
  dossierSchema,
  type Dossier,
} from "./dossier-schema";
import type { DossierUnitOfWork } from "./dossier-unit-of-work";

type DossierInput = z.input<typeof dossierSchema>;
type DossierEvidenceItemInput = z.input<typeof dossierEvidenceItemSchema>;

export type DossierSourceMaterial = Pick<
  DossierInput,
  | "executiveSummary"
  | "companyOverview"
  | "businessModel"
  | "contacts"
  | "conversationSummary"
  | "competitors"
  | "recommendations"
  | "pendingQuestions"
> & {
  evidence: DossierEvidenceItemInput[];
};

export interface DossierSourceReader {
  read(input: {
    workspaceId: string;
    campaignCompanyId: string;
  }): Promise<DossierSourceMaterial>;
}

const editablePatchSchema = dossierEditableContentSchema;

export type DossierPatch = z.input<typeof editablePatchSchema>;

type ServiceDependencies = {
  createId: () => string;
  now: () => Date;
};

const defaultDependencies: ServiceDependencies = {
  createId: () => crypto.randomUUID(),
  now: () => new Date(),
};

export class DossierService {
  private readonly dependencies: ServiceDependencies;

  constructor(
    private readonly unitOfWork: DossierUnitOfWork,
    private readonly sourceReader: DossierSourceReader,
    dependencies: Partial<ServiceDependencies> = {},
  ) {
    this.dependencies = { ...defaultDependencies, ...dependencies };
  }

  private async audit(
    auditRepository: Parameters<
      Parameters<DossierUnitOfWork["run"]>[0]
    >[0]["auditRepository"],
    dossier: Dossier,
    actorId: string,
    operation: "build" | "edit" | "hide",
  ) {
    const metadata = {
      dossierId: dossier.id,
      campaignCompanyId: dossier.campaignCompanyId,
      version: dossier.version,
      operation,
    } satisfies JsonValue;
    await auditRepository.append({
      workspaceId: dossier.workspaceId,
      actorId,
      action: "dossier.updated",
      entityId: dossier.id,
      metadata,
    });
  }

  async build(input: {
    workspaceId: string;
    campaignCompanyId: string;
    meetingId: string | null;
    actorId: string;
  }): Promise<Dossier> {
    return this.unitOfWork.run(
      async ({ dossierRepository, auditRepository }) => {
        if (
          await dossierRepository.getLatest(
            input.workspaceId,
            input.campaignCompanyId,
          )
        ) {
          throw new DossierError("DOSSIER_ALREADY_EXISTS");
        }
        const source = await this.sourceReader.read({
          workspaceId: input.workspaceId,
          campaignCompanyId: input.campaignCompanyId,
        });
        const evidence = source.evidence.map((item) =>
          dossierEvidenceItemSchema.parse(item),
        );
        const dossier = dossierSchema.parse({
          id: this.dependencies.createId(),
          workspaceId: input.workspaceId,
          campaignCompanyId: input.campaignCompanyId,
          meetingId: input.meetingId,
          version: 1,
          previousVersionId: null,
          executiveSummary: source.executiveSummary,
          companyOverview: source.companyOverview,
          businessModel: source.businessModel,
          contacts: source.contacts,
          conversationSummary: source.conversationSummary,
          confirmedNeeds: evidence.filter(
            (item) => item.kind === "confirmed_by_prospect",
          ),
          researchedFacts: evidence.filter(
            (item) => item.kind === "researched_fact",
          ),
          hypotheses: evidence.filter(
            (item) => item.kind === "hypothesis",
          ),
          estimates: evidence.filter(
            (item) => item.kind === "estimate",
          ),
          competitors: source.competitors,
          recommendations: source.recommendations,
          pendingQuestions: source.pendingQuestions,
          createdAt: this.dependencies.now(),
          createdBy: input.actorId,
        });
        const created = await dossierRepository.createInitial(dossier);
        await this.audit(auditRepository, created, input.actorId, "build");
        return created;
      },
    );
  }

  private async appendEdit(
    repository: DossierRepository,
    input: {
      workspaceId: string;
      campaignCompanyId: string;
      actorId: string;
      expectedVersion: number;
      patch: DossierPatch;
    },
  ): Promise<Dossier> {
    const latest = await repository.getLatest(
      input.workspaceId,
      input.campaignCompanyId,
    );
    if (!latest) {
      throw new DossierError("DOSSIER_NOT_FOUND");
    }
    if (latest.version !== input.expectedVersion) {
      throw new DossierError("STALE_DOSSIER_VERSION");
    }
    const patch = editablePatchSchema.parse(input.patch);
    const next = dossierSchema.parse({
      ...latest,
      ...patch,
      id: this.dependencies.createId(),
      version: latest.version + 1,
      previousVersionId: latest.id,
      createdAt: this.dependencies.now(),
      createdBy: input.actorId,
    });
    return repository.appendVersion(next, input.expectedVersion);
  }

  async edit(input: {
    workspaceId: string;
    campaignCompanyId: string;
    actorId: string;
    expectedVersion: number;
    patch: DossierPatch;
  }): Promise<Dossier> {
    return this.unitOfWork.run(
      async ({ dossierRepository, auditRepository }) => {
        const created = await this.appendEdit(dossierRepository, input);
        await this.audit(auditRepository, created, input.actorId, "edit");
        return created;
      },
    );
  }

  async hideItem(input: {
    workspaceId: string;
    campaignCompanyId: string;
    actorId: string;
    expectedVersion: number;
    itemId: string;
  }): Promise<Dossier> {
    return this.unitOfWork.run(
      async ({ dossierRepository, auditRepository }) => {
        const latest = await dossierRepository.getLatest(
          input.workspaceId,
          input.campaignCompanyId,
        );
        if (!latest) {
          throw new DossierError("DOSSIER_NOT_FOUND");
        }
        const categoryNames = [
          "confirmedNeeds",
          "researchedFacts",
          "hypotheses",
          "estimates",
          "competitors",
          "recommendations",
        ] as const;
        let found = false;
        const patch = Object.fromEntries(
          categoryNames.map((category) => [
            category,
            latest[category].map((item) => {
              if (item.id !== input.itemId) {
                return item;
              }
              found = true;
              return { ...item, hidden: true };
            }),
          ]),
        ) as DossierPatch;
        if (!found) {
          throw new DossierError("DOSSIER_ITEM_NOT_FOUND");
        }
        const created = await this.appendEdit(dossierRepository, {
          ...input,
          patch,
        });
        await this.audit(auditRepository, created, input.actorId, "hide");
        return created;
      },
    );
  }
}
