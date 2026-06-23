"use client";

import { useActionState } from "react";

import { initialActionState } from "@/features/app/action-state";
import { createCampaignAction } from "@/features/campaigns/campaign-actions";
import type { OfferTicketBand } from "@/features/offers/offer-schema";

function FieldError({
  errors,
  name,
}: {
  errors?: Record<string, string[]>;
  name: string;
}) {
  const messages = errors?.[name];
  return messages?.length ? (
    <div id={`${name}-error`}>
      {messages.map((error) => (
        <p className="field-error" key={error}>
          {error}
        </p>
      ))}
    </div>
  ) : null;
}

function fieldErrorProps(
  errors: Record<string, string[]> | undefined,
  name: string,
) {
  return errors?.[name]?.length
    ? {
        "aria-describedby": `${name}-error`,
        "aria-invalid": true as const,
      }
    : {};
}

export function CampaignForm({
  offerId,
  defaultTargetTicketBand,
}: {
  offerId: string;
  defaultTargetTicketBand: OfferTicketBand;
}) {
  const [state, action, pending] = useActionState(
    createCampaignAction,
    initialActionState,
  );

  return (
    <form action={action} className="panel form-grid" noValidate>
      <input name="offerId" type="hidden" value={offerId} />
      {state.globalError ? (
        <p className="global-error" role="alert">
          {state.globalError}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="name">Nombre de campaña</label>
        <input
          {...fieldErrorProps(state.fieldErrors, "name")}
          id="name"
          name="name"
        />
        <FieldError errors={state.fieldErrors} name="name" />
      </div>
      <div className="field">
        <label htmlFor="targetDailyEmails">Emails diarios</label>
        <input
          id="targetDailyEmails"
          inputMode="numeric"
          name="targetDailyEmails"
          type="number"
          {...fieldErrorProps(
            state.fieldErrors,
            "targetDailyEmails",
          )}
        />
        <FieldError
          errors={state.fieldErrors}
          name="targetDailyEmails"
        />
      </div>
      <div className="field">
        <label htmlFor="targetTicketBand">Ticket objetivo</label>
        <select
          {...fieldErrorProps(state.fieldErrors, "targetTicketBand")}
          defaultValue={defaultTargetTicketBand}
          id="targetTicketBand"
          name="targetTicketBand"
        >
          <option value="usd_5k_15k">USD 5k–15k</option>
          <option value="usd_15k_plus">USD 15k+</option>
        </select>
        <FieldError
          errors={state.fieldErrors}
          name="targetTicketBand"
        />
      </div>
      <div className="field">
        <label htmlFor="paidDataMode">Modo de datos</label>
        <select
          {...fieldErrorProps(state.fieldErrors, "paidDataMode")}
          defaultValue="free"
          id="paidDataMode"
          name="paidDataMode"
        >
          <option value="free">Solo gratuitos</option>
          <option value="fallback">Pago como fallback</option>
          <option value="paid">Pago permitido</option>
        </select>
        <FieldError errors={state.fieldErrors} name="paidDataMode" />
      </div>
      <div>
        <button disabled={pending} type="submit">
          {pending ? "Guardando…" : "Guardar campaña"}
        </button>
      </div>
    </form>
  );
}
