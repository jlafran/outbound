import type { db as applicationDb } from "@/db/client";
import {
  createDrizzleAuditRepository,
  createMemoryAuditRepository,
  type AuditEventInput,
  type AuditRepository,
} from "@/features/audit/audit-repository";

import {
  cloneDossierRecords,
  createDrizzleDossierPersistenceExecutor,
  createDrizzleDossierRepository,
  createMemoryDossierRepository,
  type DossierRepository,
} from "./dossier-repository";
import type { Dossier } from "./dossier-schema";

export type DossierUnitOfWorkRepositories = {
  dossierRepository: DossierRepository;
  auditRepository: AuditRepository;
};

export interface DossierUnitOfWork {
  run<T>(
    operation: (
      repositories: DossierUnitOfWorkRepositories,
    ) => Promise<T>,
  ): Promise<T>;
}

export type MemoryDossierUnitOfWorkOptions = {
  beforeAuditAppend?: (
    input: AuditEventInput,
    appendNumber: number,
  ) => void | Promise<void>;
};

export type MemoryDossierUnitOfWork = DossierUnitOfWork &
  DossierUnitOfWorkRepositories;

export function createMemoryDossierUnitOfWork(
  options: MemoryDossierUnitOfWorkOptions = {},
): MemoryDossierUnitOfWork {
  const committedDossiers = new Map<string, Dossier>();
  const committedEvents: AuditEventInput[] = [];
  const committedDossierRepository =
    createMemoryDossierRepository(committedDossiers);
  const committedAuditRepository =
    createMemoryAuditRepository(committedEvents);
  let transactionQueue = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = transactionQueue.then(operation);
    transactionQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  const dossierRepository: DossierRepository = {
    createInitial(record) {
      return enqueue(() =>
        committedDossierRepository.createInitial(record),
      );
    },
    appendVersion(record, expectedLatestVersion) {
      return enqueue(() =>
        committedDossierRepository.appendVersion(
          record,
          expectedLatestVersion,
        ),
      );
    },
    async getLatest(workspaceId, campaignCompanyId) {
      await transactionQueue;
      return committedDossierRepository.getLatest(
        workspaceId,
        campaignCompanyId,
      );
    },
    async getById(workspaceId, id) {
      await transactionQueue;
      return committedDossierRepository.getById(workspaceId, id);
    },
    async listVersions(workspaceId, campaignCompanyId) {
      await transactionQueue;
      return committedDossierRepository.listVersions(
        workspaceId,
        campaignCompanyId,
      );
    },
  };

  const auditRepository: AuditRepository = {
    append(input) {
      return enqueue(() => committedAuditRepository.append(input));
    },
    async list(workspaceId) {
      await transactionQueue;
      return committedAuditRepository.list(workspaceId);
    },
  };

  return {
    dossierRepository,
    auditRepository,
    run(operation) {
      return enqueue(async () => {
        const stagedDossiers = cloneDossierRecords(committedDossiers);
        const stagedEvents = structuredClone(committedEvents);
        const stagedDossierRepository =
          createMemoryDossierRepository(stagedDossiers);
        const stagedAuditRepository =
          createMemoryAuditRepository(stagedEvents);
        let appendNumber = 0;

        const result = await operation({
          dossierRepository: stagedDossierRepository,
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

        committedDossiers.clear();
        for (const [id, record] of stagedDossiers) {
          committedDossiers.set(id, structuredClone(record));
        }
        committedEvents.splice(
          0,
          committedEvents.length,
          ...structuredClone(stagedEvents),
        );
        return result;
      });
    },
  };
}

type ApplicationDb = typeof applicationDb;

export function createDrizzleDossierUnitOfWork(
  database: ApplicationDb,
): DossierUnitOfWork {
  return {
    run(operation) {
      return database.transaction((transaction) =>
        operation({
          dossierRepository: createDrizzleDossierRepository(
            createDrizzleDossierPersistenceExecutor(transaction),
          ),
          auditRepository: createDrizzleAuditRepository(transaction),
        }),
      );
    },
  };
}
