import { randomUUID } from "node:crypto";

import type { DentalAestheticsProspectingResult } from "./dental-prospecting-service";
import type { EmailVerifier } from "./email-verifier";
import type { ProspectingRepository } from "./prospecting-repository";

type ProspectingRunner = {
  run(): Promise<DentalAestheticsProspectingResult>;
};

type ProspectingRunServiceDependencies = {
  createId: () => string;
  now: () => Date;
};

type CampaignIdentity = {
  workspaceId: string;
  campaignId: string;
};

export class ProspectingRunService {
  constructor(
    private readonly repository: ProspectingRepository,
    private readonly runner: ProspectingRunner,
    private readonly verifier?: EmailVerifier,
    private readonly dependencies: ProspectingRunServiceDependencies = {
      createId: randomUUID,
      now: () => new Date(),
    },
  ) {}

  async run(input: CampaignIdentity): Promise<DentalAestheticsProspectingResult> {
    const runId = this.dependencies.createId();
    const startedAt = this.dependencies.now();
    await this.repository.startRun({
      id: runId,
      ...input,
      profile: "dental_aesthetics_ar",
      startedAt,
    });

    try {
      const result = await this.runner.run();
      await this.repository.completeRun({
        ...input,
        runId,
        result,
        completedAt: this.dependencies.now(),
      });
      return result;
    } catch (error) {
      await this.repository.failRun({
        ...input,
        runId,
        errorMessage:
          error instanceof Error ? error.message.slice(0, 500) : "UNKNOWN_ERROR",
        completedAt: this.dependencies.now(),
      });
      throw error;
    }
  }

  async refreshPending(input: CampaignIdentity): Promise<{
    checked: number;
    updated: number;
    pending: number;
  }> {
    const run = await this.repository.getLatestCompletedRun(
      input.workspaceId,
      input.campaignId,
    );
    if (!run) return { checked: 0, updated: 0, pending: 0 };

    const pending = await this.repository.listPendingVerifications(
      input.workspaceId,
      run.id,
    );
    if (!this.verifier?.refresh) {
      return { checked: 0, updated: 0, pending: pending.length };
    }

    let checked = 0;
    let updated = 0;
    for (const verification of pending) {
      if (!verification.providerTrackingId) continue;
      const result = await this.verifier.refresh(
        verification.providerTrackingId,
      );
      checked += 1;
      await this.repository.updateVerification({
        workspaceId: input.workspaceId,
        runId: run.id,
        verificationId: verification.id,
        status: result.status,
        checkedAt: this.dependencies.now(),
      });
      if (result.status !== "pending") updated += 1;
    }

    const remaining = await this.repository.listPendingVerifications(
      input.workspaceId,
      run.id,
    );
    return { checked, updated, pending: remaining.length };
  }
}
