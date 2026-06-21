"use client";

import { useActionState } from "react";

import { initialActionState } from "@/features/app/action-state";
import { createCampaignAction } from "@/features/campaigns/campaign-actions";

function FieldError({
  errors,
  name,
}: {
  errors?: Record<string, string[]>;
  name: string;
}) {
  return errors?.[name]?.map((error) => (
    <p className="field-error" key={error}>
      {error}
    </p>
  ));
}

export function CampaignForm({ offerId }: { offerId: string }) {
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
        <input id="name" name="name" />
        <FieldError errors={state.fieldErrors} name="name" />
      </div>
      <div className="field">
        <label htmlFor="targetDailyEmails">Emails diarios</label>
        <input
          id="targetDailyEmails"
          inputMode="numeric"
          name="targetDailyEmails"
          type="number"
        />
        <FieldError
          errors={state.fieldErrors}
          name="targetDailyEmails"
        />
      </div>
      <div className="field">
        <label htmlFor="paidDataMode">Modo de datos</label>
        <select
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
