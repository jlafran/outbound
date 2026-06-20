import type { db as applicationDb } from "@/db/client";
import {
  createDrizzleAuditRepository,
  createMemoryAuditRepository,
  type AuditEventInput,
  type AuditRepository,
} from "@/features/audit/audit-repository";

import {
  createDrizzleOfferRepository,
  createMemoryOfferRepository,
  type OfferRecord,
  type OfferRepository,
} from "./offer-repository";

export type OfferUnitOfWorkRepositories = {
  offerRepository: OfferRepository;
  auditRepository: AuditRepository;
};

export interface OfferUnitOfWork {
  run<T>(
    operation: (
      repositories: OfferUnitOfWorkRepositories,
    ) => Promise<T>,
  ): Promise<T>;
}

export type MemoryOfferUnitOfWorkOptions = {
  beforeAuditAppend?: (
    input: AuditEventInput,
    appendNumber: number,
  ) => void | Promise<void>;
};

export type MemoryOfferUnitOfWork = OfferUnitOfWork &
  OfferUnitOfWorkRepositories;

function cloneOfferRecords(
  records: Map<string, OfferRecord>,
): Map<string, OfferRecord> {
  return new Map(
    Array.from(records, ([id, record]) => [id, structuredClone(record)]),
  );
}

export function createMemoryOfferUnitOfWork(
  options: MemoryOfferUnitOfWorkOptions = {},
): MemoryOfferUnitOfWork {
  const committedOffers = new Map<string, OfferRecord>();
  const committedEvents: AuditEventInput[] = [];
  const offerRepository = createMemoryOfferRepository(committedOffers);
  const auditRepository = createMemoryAuditRepository(committedEvents);
  let transactionQueue = Promise.resolve();

  return {
    offerRepository,
    auditRepository,
    run(operation) {
      const transaction = transactionQueue.then(async () => {
        const stagedOffers = cloneOfferRecords(committedOffers);
        const stagedEvents = structuredClone(committedEvents);
        const stagedOfferRepository =
          createMemoryOfferRepository(stagedOffers);
        const stagedAuditRepository =
          createMemoryAuditRepository(stagedEvents);
        let appendNumber = 0;

        const result = await operation({
          offerRepository: stagedOfferRepository,
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

        committedOffers.clear();
        for (const [id, record] of stagedOffers) {
          committedOffers.set(id, structuredClone(record));
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

export function createDrizzleOfferUnitOfWork(
  database: ApplicationDb,
): OfferUnitOfWork {
  return {
    run(operation) {
      return database.transaction((transaction) =>
        operation({
          offerRepository: createDrizzleOfferRepository(transaction),
          auditRepository: createDrizzleAuditRepository(transaction),
        }),
      );
    },
  };
}
