import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import type { db as applicationDb } from "@/db/client";
import {
  prospectingEmailVerifications,
  prospectingRuns,
} from "@/db/schema";

import type { DentalAestheticsProspectingResult } from "./dental-prospecting-service";
import type { EmailVerificationStatus } from "./email-verifier";

export type ProspectingRunRecord = typeof prospectingRuns.$inferSelect;
export type ProspectingVerificationRecord =
  typeof prospectingEmailVerifications.$inferSelect;

type StartRunInput = {
  id: string;
  workspaceId: string;
  campaignId: string;
  profile: string;
  startedAt: Date;
};

type CompleteRunInput = {
  workspaceId: string;
  campaignId: string;
  runId: string;
  result: DentalAestheticsProspectingResult;
  completedAt: Date;
};

type FailRunInput = {
  workspaceId: string;
  campaignId: string;
  runId: string;
  errorMessage: string;
  completedAt: Date;
};

type UpdateVerificationInput = {
  workspaceId: string;
  runId: string;
  verificationId: string;
  status: EmailVerificationStatus;
  checkedAt: Date;
};

export interface ProspectingRepository {
  startRun(input: StartRunInput): Promise<void>;
  completeRun(input: CompleteRunInput): Promise<void>;
  failRun(input: FailRunInput): Promise<void>;
  getLatestCompletedRun(
    workspaceId: string,
    campaignId: string,
  ): Promise<ProspectingRunRecord | null>;
  listPendingVerifications(
    workspaceId: string,
    runId: string,
  ): Promise<ProspectingVerificationRecord[]>;
  updateVerification(input: UpdateVerificationInput): Promise<void>;
}

export type ProspectingDbExecutor = Pick<
  typeof applicationDb,
  "insert" | "select" | "update" | "transaction"
>;

type ProspectingRepositoryDependencies = {
  createId: () => string;
};

export function createDrizzleProspectingRepository(
  database: ProspectingDbExecutor,
  dependencies: ProspectingRepositoryDependencies = {
    createId: randomUUID,
  },
): ProspectingRepository {
  return {
    async startRun(input) {
      await database.insert(prospectingRuns).values({
        ...input,
        status: "running",
        resultSnapshot: null,
        errorMessage: null,
        completedAt: null,
        createdAt: input.startedAt,
        updatedAt: input.startedAt,
      });
    },

    async completeRun(input) {
      await database.transaction(async (transaction) => {
        await transaction
          .update(prospectingRuns)
          .set({
            status: "completed",
            resultSnapshot: input.result,
            errorMessage: null,
            completedAt: input.completedAt,
            updatedAt: input.completedAt,
          })
          .where(
            and(
              eq(prospectingRuns.workspaceId, input.workspaceId),
              eq(prospectingRuns.campaignId, input.campaignId),
              eq(prospectingRuns.id, input.runId),
            ),
          );

        for (const lead of input.result.leads) {
          for (const candidate of lead.contacts.emailCandidates) {
            await transaction.insert(prospectingEmailVerifications).values({
              id: dependencies.createId(),
              workspaceId: input.workspaceId,
              campaignId: input.campaignId,
              runId: input.runId,
              leadDomain: lead.domain,
              email: candidate.email.toLowerCase(),
              source: candidate.source,
              provider: candidate.verificationProvider ?? null,
              status: candidate.verificationStatus,
              providerTrackingId:
                candidate.verificationTrackingId ?? null,
              checkedAt:
                candidate.verificationStatus === "pending" ||
                candidate.verificationStatus === "unverified"
                  ? null
                  : input.completedAt,
              createdAt: input.completedAt,
              updatedAt: input.completedAt,
            });
          }
        }
      });
    },

    async failRun(input) {
      await database
        .update(prospectingRuns)
        .set({
          status: "failed",
          errorMessage: input.errorMessage,
          completedAt: input.completedAt,
          updatedAt: input.completedAt,
        })
        .where(
          and(
            eq(prospectingRuns.workspaceId, input.workspaceId),
            eq(prospectingRuns.campaignId, input.campaignId),
            eq(prospectingRuns.id, input.runId),
          ),
        );
    },

    async getLatestCompletedRun(workspaceId, campaignId) {
      const [run] = await database
        .select()
        .from(prospectingRuns)
        .where(
          and(
            eq(prospectingRuns.workspaceId, workspaceId),
            eq(prospectingRuns.campaignId, campaignId),
            eq(prospectingRuns.status, "completed"),
          ),
        )
        .orderBy(desc(prospectingRuns.createdAt), desc(prospectingRuns.id))
        .limit(1);
      return run ?? null;
    },

    async listPendingVerifications(workspaceId, runId) {
      return database
        .select()
        .from(prospectingEmailVerifications)
        .where(
          and(
            eq(prospectingEmailVerifications.workspaceId, workspaceId),
            eq(prospectingEmailVerifications.runId, runId),
            eq(prospectingEmailVerifications.status, "pending"),
          ),
        );
    },

    async updateVerification(input) {
      await database.transaction(async (transaction) => {
        const [verification] = await transaction
          .select()
          .from(prospectingEmailVerifications)
          .where(
            and(
              eq(
                prospectingEmailVerifications.workspaceId,
                input.workspaceId,
              ),
              eq(prospectingEmailVerifications.runId, input.runId),
              eq(
                prospectingEmailVerifications.id,
                input.verificationId,
              ),
            ),
          )
          .limit(1);
        if (!verification) return;

        await transaction
          .update(prospectingEmailVerifications)
          .set({
            status: input.status,
            checkedAt: input.checkedAt,
            updatedAt: input.checkedAt,
          })
          .where(
            and(
              eq(
                prospectingEmailVerifications.workspaceId,
                input.workspaceId,
              ),
              eq(prospectingEmailVerifications.id, input.verificationId),
            ),
          );

        const [run] = await transaction
          .select()
          .from(prospectingRuns)
          .where(
            and(
              eq(prospectingRuns.workspaceId, input.workspaceId),
              eq(prospectingRuns.id, input.runId),
            ),
          )
          .limit(1);
        if (!run?.resultSnapshot) return;

        const snapshot = structuredClone(run.resultSnapshot);
        const lead = snapshot.leads.find(
          ({ domain }) => domain === verification.leadDomain,
        );
        const candidate = lead?.contacts.emailCandidates.find(
          ({ email }) => email.toLowerCase() === verification.email,
        );
        if (candidate) candidate.verificationStatus = input.status;

        await transaction
          .update(prospectingRuns)
          .set({ resultSnapshot: snapshot, updatedAt: input.checkedAt })
          .where(
            and(
              eq(prospectingRuns.workspaceId, input.workspaceId),
              eq(prospectingRuns.id, input.runId),
            ),
          );
      });
    },
  };
}

export function createMemoryProspectingRepository(): ProspectingRepository {
  const runs = new Map<string, ProspectingRunRecord>();
  const verifications = new Map<string, ProspectingVerificationRecord>();
  let verificationSequence = 0;

  return {
    async startRun(input) {
      runs.set(input.id, {
        ...input,
        status: "running",
        resultSnapshot: null,
        errorMessage: null,
        completedAt: null,
        createdAt: input.startedAt,
        updatedAt: input.startedAt,
      });
    },
    async completeRun(input) {
      const run = runs.get(input.runId);
      if (!run || run.workspaceId !== input.workspaceId) return;
      run.status = "completed";
      run.resultSnapshot = structuredClone(input.result);
      run.completedAt = input.completedAt;
      run.updatedAt = input.completedAt;
      for (const lead of input.result.leads) {
        for (const candidate of lead.contacts.emailCandidates) {
          const id = `verification-${++verificationSequence}`;
          verifications.set(id, {
            id,
            workspaceId: input.workspaceId,
            campaignId: input.campaignId,
            runId: input.runId,
            leadDomain: lead.domain,
            email: candidate.email.toLowerCase(),
            source: candidate.source,
            provider: candidate.verificationProvider ?? null,
            status: candidate.verificationStatus,
            providerTrackingId: candidate.verificationTrackingId ?? null,
            checkedAt: null,
            createdAt: input.completedAt,
            updatedAt: input.completedAt,
          });
        }
      }
    },
    async failRun(input) {
      const run = runs.get(input.runId);
      if (!run || run.workspaceId !== input.workspaceId) return;
      run.status = "failed";
      run.errorMessage = input.errorMessage;
      run.completedAt = input.completedAt;
      run.updatedAt = input.completedAt;
    },
    async getLatestCompletedRun(workspaceId, campaignId) {
      const run = [...runs.values()]
        .filter(
          (item) =>
            item.workspaceId === workspaceId &&
            item.campaignId === campaignId &&
            item.status === "completed",
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
      return run ? structuredClone(run) : null;
    },
    async listPendingVerifications(workspaceId, runId) {
      return [...verifications.values()]
        .filter(
          (item) =>
            item.workspaceId === workspaceId &&
            item.runId === runId &&
            item.status === "pending",
        )
        .map((item) => structuredClone(item));
    },
    async updateVerification(input) {
      const verification = verifications.get(input.verificationId);
      const run = runs.get(input.runId);
      if (
        !verification ||
        !run?.resultSnapshot ||
        verification.workspaceId !== input.workspaceId ||
        run.workspaceId !== input.workspaceId
      ) {
        return;
      }
      verification.status = input.status;
      verification.checkedAt = input.checkedAt;
      verification.updatedAt = input.checkedAt;
      const candidate = run.resultSnapshot.leads
        .find(({ domain }) => domain === verification.leadDomain)
        ?.contacts.emailCandidates.find(
          ({ email }) => email.toLowerCase() === verification.email,
        );
      if (candidate) candidate.verificationStatus = input.status;
      run.updatedAt = input.checkedAt;
    },
  };
}
