"use client";

import { useActionState } from "react";

import { initialActionState } from "@/features/app/action-state";
import { createOfferAction } from "@/features/offers/offer-actions";

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

export default function NewOfferPage() {
  const [state, action, pending] = useActionState(
    createOfferAction,
    initialActionState,
  );

  return (
    <>
      <div className="page-heading">
        <h1>Nueva oferta</h1>
        <p className="muted">
          Cargá la solución para normalizarla antes de crear una campaña.
        </p>
      </div>
      <form action={action} className="panel form-grid" noValidate>
        {state.globalError ? (
          <p className="global-error" role="alert">
            {state.globalError}
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="name">Nombre</label>
          <input
            {...fieldErrorProps(state.fieldErrors, "name")}
            id="name"
            name="name"
          />
          <FieldError errors={state.fieldErrors} name="name" />
        </div>
        <div className="field">
          <label htmlFor="rawText">Documento de la solución</label>
          <textarea
            {...fieldErrorProps(state.fieldErrors, "rawText")}
            id="rawText"
            name="rawText"
          />
          <FieldError errors={state.fieldErrors} name="rawText" />
        </div>
        <div className="field">
          <label htmlFor="problems">Problemas (uno por línea)</label>
          <textarea
            {...fieldErrorProps(state.fieldErrors, "problems")}
            id="problems"
            name="problems"
          />
          <FieldError errors={state.fieldErrors} name="problems" />
        </div>
        <div className="field">
          <label htmlFor="expectedResults">
            Resultados esperados (uno por línea)
          </label>
          <textarea
            {...fieldErrorProps(state.fieldErrors, "expectedResults")}
            id="expectedResults"
            name="expectedResults"
          />
          <FieldError
            errors={state.fieldErrors}
            name="expectedResults"
          />
        </div>
        <div className="field">
          <label htmlFor="ticketBand">Ticket objetivo</label>
          <select
            {...fieldErrorProps(state.fieldErrors, "ticketBand")}
            defaultValue=""
            id="ticketBand"
            name="ticketBand"
          >
            <option disabled value="">
              Seleccionar
            </option>
            <option value="usd_5k_15k">USD 5k–15k</option>
            <option value="usd_15k_plus">USD 15k+</option>
          </select>
          <FieldError errors={state.fieldErrors} name="ticketBand" />
        </div>
        <div className="field">
          <label htmlFor="allowedPilot">Piloto permitido</label>
          <input
            {...fieldErrorProps(state.fieldErrors, "allowedPilot")}
            id="allowedPilot"
            name="allowedPilot"
          />
          <FieldError errors={state.fieldErrors} name="allowedPilot" />
        </div>
        <div className="field">
          <label htmlFor="prohibitedClaims">
            Promesas prohibidas (una por línea)
          </label>
          <textarea id="prohibitedClaims" name="prohibitedClaims" />
        </div>
        <div>
          <button disabled={pending} type="submit">
            {pending ? "Guardando…" : "Guardar oferta"}
          </button>
        </div>
      </form>
    </>
  );
}
