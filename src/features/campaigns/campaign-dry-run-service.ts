import type { CampaignRepository } from "./campaign-repository";
import { CampaignError } from "./campaign-schema";
import type {
  CampaignDryRunProjection,
  GeneratedCampaignData,
} from "./campaign-projections";
import type { DossierService } from "@/features/dossiers/dossier-service";
import type { DossierRepository } from "@/features/dossiers/dossier-repository";
import type { ResearchProvider } from "@/features/research/research-provider";

export class CampaignDryRunService {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly researchProvider: ResearchProvider,
    private readonly dossierService: DossierService,
    private readonly dossierRepository: DossierRepository,
    private readonly projection: CampaignDryRunProjection,
  ) {}

  async generate(input: {
    workspaceId: string;
    campaignId: string;
    actorId: string;
    expectedVersion: number;
  }): Promise<GeneratedCampaignData> {
    const campaign = await this.campaignRepository.getById(
      input.workspaceId,
      input.campaignId,
    );
    if (!campaign) {
      throw new CampaignError("CAMPAIGN_NOT_FOUND");
    }
    if (campaign.version !== input.expectedVersion) {
      throw new CampaignError("STALE_CAMPAIGN_UPDATE");
    }
    if (campaign.state !== "discovery_ready") {
      throw new CampaignError("INVALID_CAMPAIGN_TRANSITION");
    }

    return this.projection.getOrCreate(
      input.workspaceId,
      input.campaignId,
      async () => {
        const result = await this.researchProvider.researchCampaign({
          workspaceId: input.workspaceId,
          campaignId: input.campaignId,
          offerId: campaign.offerId,
        });
        const companies = [...result.companies].sort(
          (left, right) =>
            right.score.total - left.score.total ||
            left.domain.localeCompare(right.domain),
        );
        const highest = companies[0];
        if (!highest) {
          throw new Error("DRY_RUN_COMPANIES_REQUIRED");
        }

        await this.projection.stageCompanies(
          input.workspaceId,
          companies,
        );
        const existingDossier = await this.dossierRepository.getLatest(
          input.workspaceId,
          highest.campaignCompanyId,
        );
        const dossier =
          existingDossier ??
          (await this.dossierService.build({
            workspaceId: input.workspaceId,
            campaignCompanyId: highest.campaignCompanyId,
            meetingId: null,
            actorId: input.actorId,
          }));

        return {
          campaignId: input.campaignId,
          companies,
          dossierId: dossier.id,
        };
      },
    );
  }
}
