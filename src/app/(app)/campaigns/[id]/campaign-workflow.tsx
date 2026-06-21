"use client";

import { useActionState, useState } from "react";

import {
  initialActionState,
  type ActionState,
} from "@/features/app/action-state";
import {
  approveNichesAction,
  generateDryRunAction,
  moveToDiscoveryReadyAction,
  moveToNicheReviewAction,
  recommendNichesAction,
} from "@/features/campaigns/campaign-actions";
import type { CampaignRecord } from "@/features/campaigns/campaign-schema";
import type { NicheRecommendation } from "@/features/niches/niche-schema";

function HiddenCampaignFields({
  campaign,
}: {
  campaign: CampaignRecord;
}) {
  return (
    <>
      <input name="campaignId" type="hidden" value={campaign.id} />
      <input
        name="expectedVersion"
        type="hidden"
        value={campaign.version}
      />
    </>
  );
}

function ErrorMessage({ state }: { state: ActionState }) {
  return state.status === "error" && state.globalError ? (
    <p className="global-error" role="alert">
      {state.globalError}
    </p>
  ) : null;
}

function RecommendationCards({
  recommendations,
  selectable,
  selected,
  onSelectionChange,
}: {
  recommendations: NicheRecommendation[];
  selectable: boolean;
  selected: string[];
  onSelectionChange?: (ids: string[]) => void;
}) {
  return (
    <div className="card-grid">
      {recommendations.map((recommendation) => {
        const checked = selected.includes(recommendation.id);
        return (
          <article className="card" key={recommendation.id}>
            <p className="muted">Score general {recommendation.score}</p>
            <h2>{recommendation.name}</h2>
            <dl className="score-grid">
              <div>
                <dt>Capacidad de pago</dt>
                <dd>{recommendation.capacityToPay}</dd>
              </div>
              <div>
                <dt>Magnitud del problema</dt>
                <dd>{recommendation.problemMagnitude}</dd>
              </div>
              <div>
                <dt>Urgencia</dt>
                <dd>{recommendation.urgency}</dd>
              </div>
              <div>
                <dt>Claridad de ROI</dt>
                <dd>{recommendation.roiClarity}</dd>
              </div>
              <div>
                <dt>Acceso al decisor</dt>
                <dd>{recommendation.decisionMakerAccess}</dd>
              </div>
              <div>
                <dt>Empresas estimadas</dt>
                <dd>{recommendation.estimatedCompanyCount}</dd>
              </div>
            </dl>
            <p>{recommendation.reasoning}</p>
            {selectable ? (
              <label className="checkbox-row">
                <input
                  checked={checked}
                  name="nicheIds"
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, recommendation.id]
                      : selected.filter((id) => id !== recommendation.id);
                    onSelectionChange?.(next);
                  }}
                  type="checkbox"
                  value={recommendation.id}
                />
                Seleccionar {recommendation.name}
              </label>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function CampaignWorkflow({
  campaign,
  recommendations,
}: {
  campaign: CampaignRecord;
  recommendations: NicheRecommendation[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [recommendState, recommendAction, recommendPending] =
    useActionState(recommendNichesAction, initialActionState);
  const [reviewState, reviewAction, reviewPending] = useActionState(
    moveToNicheReviewAction,
    initialActionState,
  );
  const [approveState, approveAction, approvePending] = useActionState(
    approveNichesAction,
    initialActionState,
  );
  const [readyState, readyAction, readyPending] = useActionState(
    moveToDiscoveryReadyAction,
    initialActionState,
  );
  const [generateState, generateAction, generatePending] =
    useActionState(generateDryRunAction, initialActionState);

  if (campaign.state === "draft" && recommendations.length === 0) {
    return (
      <form action={recommendAction} className="workflow-actions">
        <HiddenCampaignFields campaign={campaign} />
        <ErrorMessage state={recommendState} />
        <button disabled={recommendPending} type="submit">
          Recomendar nichos
        </button>
      </form>
    );
  }

  if (campaign.state === "draft") {
    return (
      <div className="workflow">
        <RecommendationCards
          recommendations={recommendations}
          selectable={false}
          selected={[]}
        />
        <form action={reviewAction} className="workflow-actions">
          <HiddenCampaignFields campaign={campaign} />
          <ErrorMessage state={reviewState} />
          <button disabled={reviewPending} type="submit">
            Pasar a revisión
          </button>
        </form>
      </div>
    );
  }

  if (
    campaign.state === "niche_review" &&
    campaign.approvedNicheIds.length === 0
  ) {
    return (
      <form action={approveAction} className="workflow">
        <HiddenCampaignFields campaign={campaign} />
        <RecommendationCards
          onSelectionChange={setSelected}
          recommendations={recommendations}
          selectable
          selected={selected}
        />
        <ErrorMessage state={approveState} />
        <div className="workflow-actions">
          <button
            disabled={approvePending || selected.length === 0}
            type="submit"
          >
            Aprobar nichos
          </button>
        </div>
      </form>
    );
  }

  if (campaign.state === "niche_review") {
    return (
      <div className="workflow">
        <RecommendationCards
          recommendations={recommendations.filter((recommendation) =>
            campaign.approvedNicheIds.includes(recommendation.id),
          )}
          selectable={false}
          selected={campaign.approvedNicheIds}
        />
        <form action={readyAction} className="workflow-actions">
          <HiddenCampaignFields campaign={campaign} />
          <ErrorMessage state={readyState} />
          <button disabled={readyPending} type="submit">
            Preparar discovery
          </button>
        </form>
      </div>
    );
  }

  if (campaign.state === "discovery_ready") {
    return (
      <form action={generateAction} className="workflow-actions">
        <HiddenCampaignFields campaign={campaign} />
        <ErrorMessage state={generateState} />
        <button disabled={generatePending} type="submit">
          Generar datos dry-run
        </button>
      </form>
    );
  }

  return null;
}
