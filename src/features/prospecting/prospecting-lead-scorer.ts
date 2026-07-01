import type {
  ProspectingLeadStatus,
  ProspectingScoreBreakdown,
} from "./prospecting-types";

type ScoreFlag = "directory" | "editorial" | "ambiguous" | "contradiction";

export function scoreProspectingLead(input: {
  companyValidated: boolean;
  offerFitEvidenceCount: number;
  decisionMakerConfidences: Array<"low" | "medium" | "high">;
  hasPersonalEmail: boolean;
  hasWhatsapp: boolean;
  hasGenericEmail: boolean;
  emailVerificationStatuses: string[];
  opportunitySignalCount: number;
  sourceUrls: string[];
  flags: ScoreFlag[];
}): ProspectingScoreBreakdown & { status: ProspectingLeadStatus } {
  const strongestDecisionConfidence = input.decisionMakerConfidences.includes("high")
    ? "high"
    : input.decisionMakerConfidences.includes("medium")
      ? "medium"
      : input.decisionMakerConfidences.includes("low")
        ? "low"
        : null;
  const components = {
    companyValidation: input.companyValidated ? 20 : 0,
    offerFit:
      input.offerFitEvidenceCount >= 2
        ? 15
        : input.offerFitEvidenceCount === 1
          ? 10
          : 0,
    decisionMaker:
      strongestDecisionConfidence === "high"
        ? 20
        : strongestDecisionConfidence === "medium"
          ? 16
          : strongestDecisionConfidence === "low"
            ? 5
            : 0,
    directChannel: input.hasPersonalEmail
      ? 15
      : input.hasWhatsapp
        ? 12
        : input.hasGenericEmail
          ? 8
          : 0,
    verifiedEmail: input.emailVerificationStatuses.includes("valid")
      ? 15
      : input.emailVerificationStatuses.includes("risky")
        ? 7
        : 0,
    opportunitySignal: Math.min(10, input.opportunitySignalCount * 5),
    sourceQuality: Math.min(5, new Set(input.sourceUrls).size * 2 + 1),
  };
  const penaltyValues: Record<ScoreFlag, { label: string; value: number }> = {
    directory: { label: "Directorio, no sitio oficial", value: -25 },
    editorial: { label: "Contenido editorial", value: -20 },
    ambiguous: { label: "Identidad empresarial ambigua", value: -15 },
    contradiction: { label: "Evidencia contradictoria", value: -40 },
  };
  const penalties = [...new Set(input.flags)].map((flag) => penaltyValues[flag]);
  const subtotal = Object.values(components).reduce((sum, value) => sum + value, 0);
  const total = Math.max(
    0,
    Math.min(100, subtotal + penalties.reduce((sum, item) => sum + item.value, 0)),
  );
  const hasAssociatedDecisionMaker =
    strongestDecisionConfidence === "high" || strongestDecisionConfidence === "medium";
  const hasUsableChannel =
    input.hasPersonalEmail || input.hasWhatsapp || input.hasGenericEmail;
  const reasons: string[] = [];
  if (!input.companyValidated) reasons.push("No se validó una empresa real del nicho.");
  if (!hasAssociatedDecisionMaker) {
    reasons.push("Falta un decisor asociado con confianza suficiente.");
  }
  if (!hasUsableChannel) reasons.push("Falta un canal de contacto utilizable.");
  if (input.opportunitySignalCount === 0) {
    reasons.push("No se encontró una señal específica para personalizar el contacto.");
  }

  const status: ProspectingLeadStatus =
    input.companyValidated && hasAssociatedDecisionMaker && hasUsableChannel && total >= 75
      ? "actionable"
      : input.companyValidated && total >= 50
        ? "review"
        : "discarded";

  return { total, status, components, penalties, reasons };
}
