"use client";

import { useActionState, useState } from "react";

import {
  initialActionState,
  type ActionState,
} from "@/features/app/action-state";
import {
  addRecommendationAction,
  editDossierItemAction,
  hideDossierItemAction,
} from "@/features/dossiers/dossier-actions";
import type { DossierItem } from "@/features/dossiers/dossier-schema";

type DossierCategory =
  | "confirmedNeeds"
  | "researchedFacts"
  | "hypotheses"
  | "estimates"
  | "competitors"
  | "recommendations";

function HiddenVersionFields({
  dossierId,
  version,
}: {
  dossierId: string;
  version: number;
}) {
  return (
    <>
      <input name="dossierId" type="hidden" value={dossierId} />
      <input name="expectedVersion" type="hidden" value={version} />
    </>
  );
}

function ActionErrors({
  state,
  field,
  id,
}: {
  state: ActionState;
  field?: string;
  id: string;
}) {
  const messages = field ? state.fieldErrors?.[field] : undefined;
  return (
    <div aria-live="polite" id={id}>
      {state.globalError ? (
        <p className="global-error">{state.globalError}</p>
      ) : null}
      {messages?.map((message) => (
        <p className="field-error" key={message}>
          {message}
        </p>
      ))}
    </div>
  );
}

export function DossierItemControls({
  category,
  dossierId,
  item,
  version,
}: {
  category: DossierCategory;
  dossierId: string;
  item: DossierItem;
  version: number;
}) {
  const [editState, editAction, editPending] = useActionState(
    editDossierItemAction,
    initialActionState,
  );
  const [hideState, hideAction, hidePending] = useActionState(
    hideDossierItemAction,
    initialActionState,
  );
  const editErrorId = `edit-${item.id}-error`;
  const hasEditError =
    Boolean(editState.globalError) ||
    Boolean(editState.fieldErrors?.statement?.length);

  return (
    <div className="dossier-item-actions">
      <details
        aria-label={`Editar elemento: ${item.statement}`}
        className="dossier-editor"
        role="group"
      >
        <summary>Editar elemento</summary>
        <form action={editAction} className="form-grid" noValidate>
          <HiddenVersionFields dossierId={dossierId} version={version} />
          <input name="category" type="hidden" value={category} />
          <input name="itemId" type="hidden" value={item.id} />
          <div className="field">
            <label htmlFor={`statement-${item.id}`}>Declaración</label>
            <textarea
              aria-describedby={hasEditError ? editErrorId : undefined}
              aria-invalid={hasEditError || undefined}
              defaultValue={item.statement}
              id={`statement-${item.id}`}
              name="statement"
            />
          </div>
          <label className="checkbox-row">
            <input
              defaultChecked={item.hidden}
              name="hidden"
              type="checkbox"
            />
            Oculto
          </label>
          <ActionErrors
            field="statement"
            id={editErrorId}
            state={editState}
          />
          <div>
            <button disabled={editPending} type="submit">
              {editPending ? "Guardando…" : "Guardar nueva versión"}
            </button>
          </div>
        </form>
      </details>
      {!item.hidden ? (
        <form action={hideAction}>
          <HiddenVersionFields dossierId={dossierId} version={version} />
          <input name="itemId" type="hidden" value={item.id} />
          <ActionErrors id={`hide-${item.id}-error`} state={hideState} />
          <button
            className="secondary-button"
            disabled={hidePending}
            type="submit"
          >
            {hidePending ? "Ocultando…" : "Ocultar"}
          </button>
        </form>
      ) : null}
    </div>
  );
}

export function RecommendationEditor({
  dossierId,
  version,
}: {
  dossierId: string;
  version: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    addRecommendationAction,
    initialActionState,
  );
  const regionId = `recommendation-editor-${dossierId}`;
  const errorId = "new-recommendation-error";
  const hasError =
    Boolean(state.globalError) ||
    Boolean(state.fieldErrors?.statement?.length);

  return (
    <div className="recommendation-editor">
      <button
        aria-controls={regionId}
        aria-expanded={open}
        className="secondary-button"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Editar recomendaciones
      </button>
      {open ? (
        <div id={regionId} role="region">
          <form action={action} className="panel form-grid" noValidate>
            <HiddenVersionFields dossierId={dossierId} version={version} />
            <div className="field">
              <label htmlFor="new-recommendation">Nueva recomendación</label>
              <textarea
                aria-describedby={hasError ? errorId : undefined}
                aria-invalid={hasError || undefined}
                id="new-recommendation"
                name="statement"
              />
            </div>
            <ActionErrors field="statement" id={errorId} state={state} />
            <div>
              <button disabled={pending} type="submit">
                {pending ? "Guardando…" : "Guardar nueva versión"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
