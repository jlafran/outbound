import type { db as applicationDb } from "@/db/client";
import {
  createDrizzleAuditRepository,
  createMemoryAuditRepository,
  type AuditEventInput,
  type AuditRepository,
} from "@/features/audit/audit-repository";

import {
  createDrizzleCampaignPersistenceExecutor,
  createDrizzleCampaignRepository,
  createMemoryCampaignRepository,
  type CampaignRepository,
} from "./campaign-repository";
import type { CampaignRecord } from "./campaign-schema";

export type CampaignUnitOfWorkRepositories = {
  campaignRepository: CampaignRepository;
  auditRepository: AuditRepository;
};

export interface CampaignUnitOfWork {
  run<T>(
    operation: (
      repositories: CampaignUnitOfWorkRepositories,
    ) => Promise<T>,
  ): Promise<T>;
}

export type MemoryCampaignUnitOfWorkOptions = {
  beforeAuditAppend?: (
    input: AuditEventInput,
    appendNumber: number,
  ) => void | Promise<void>;
};

export type MemoryCampaignUnitOfWork = CampaignUnitOfWork &
  CampaignUnitOfWorkRepositories;

function cloneCampaignRecords(
  records: Map<string, CampaignRecord>,
): Map<string, CampaignRecord> {
  return new Map(
    Array.from(records, ([id, record]) => [id, structuredClone(record)]),
  );
}

export function createMemoryCampaignUnitOfWork(
  options: MemoryCampaignUnitOfWorkOptions = {},
): MemoryCampaignUnitOfWork {
  const committedCampaigns = new Map<string, CampaignRecord>();
  const committedEvents: AuditEventInput[] = [];
  const campaignRepository =
    createMemoryCampaignRepository(committedCampaigns);
  const auditRepository = createMemoryAuditRepository(committedEvents);
  let transactionQueue = Promise.resolve();

  return {
    campaignRepository,
    auditRepository,
    run(operation) {
      const transaction = transactionQueue.then(async () => {
        const stagedCampaigns = cloneCampaignRecords(
          committedCampaigns,
        );
        const stagedEvents = structuredClone(committedEvents);
        const stagedCampaignRepository =
          createMemoryCampaignRepository(stagedCampaigns);
        const stagedAuditRepository =
          createMemoryAuditRepository(stagedEvents);
        let appendNumber = 0;

        const result = await operation({
          campaignRepository: stagedCampaignRepository,
          auditRepository: {
            async append(input) {
              appendNumber += 1;
              await options.beforeAuditAppend?.(input, appendNumber);
              await stagedAuditRepository.append(input);
            },
            list(workspaceId) {
              return stagedAuditRepository.list(workspaceId);
            },
          },
        });

        committedCampaigns.clear();
        for (const [id, record] of stagedCampaigns) {
          committedCampaigns.set(id, structuredClone(record));
        }
        committedEvents.splice(
          0,
          committedEvents.length,
          ...structuredClone(stagedEvents),
        );

        return result;
      });

      transactionQueue = transaction.then(
        () => undefined,
        () => undefined,
      );

      return transaction;
    },
  };
}

type ApplicationDb = typeof applicationDb;

export function createDrizzleCampaignUnitOfWork(
  database: ApplicationDb,
): CampaignUnitOfWork {
  return {
    run(operation) {
      return database.transaction((transaction) =>
        operation({
          campaignRepository: createDrizzleCampaignRepository(
            createDrizzleCampaignPersistenceExecutor(transaction),
          ),
          auditRepository: createDrizzleAuditRepository(transaction),
        }),
      );
    },
  };
}
