import type {
  AuditRepository,
  JsonValue,
} from "@/features/audit/audit-repository";

import { normalizeOffer } from "./offer-normalizer";
import type {
  OfferRecord,
  OfferRepository,
} from "./offer-repository";
import type { OfferInput } from "./offer-schema";

export type CreateOfferInput = {
  workspaceId: string;
  actorId: string;
  input: OfferInput;
};

export class OfferService {
  constructor(
    private readonly offerRepository: OfferRepository,
    private readonly auditRepository: AuditRepository,
  ) {}

  async createOffer({
    workspaceId,
    actorId,
    input,
  }: CreateOfferInput): Promise<OfferRecord> {
    const normalized = normalizeOffer(input);
    const record: OfferRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      createdBy: actorId,
      ...normalized,
      createdAt: new Date(),
    };
    const persisted = await this.offerRepository.create(record);

    const createdMetadata = {
      name: persisted.name,
      ticketBand: persisted.ticketBand,
      version: persisted.version,
    } satisfies JsonValue;
    const normalizedMetadata = {
      problemCount: persisted.problems.length,
      expectedResultCount: persisted.expectedResults.length,
      version: persisted.version,
    } satisfies JsonValue;

    await this.auditRepository.append({
      workspaceId,
      actorId,
      action: "offer.created",
      entityId: persisted.id,
      metadata: createdMetadata,
    });
    await this.auditRepository.append({
      workspaceId,
      actorId,
      action: "offer.normalized",
      entityId: persisted.id,
      metadata: normalizedMetadata,
    });

    return persisted;
  }
}
