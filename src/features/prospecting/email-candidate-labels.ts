import type { ProspectingLead } from "./prospecting-types";

type EmailCandidate =
  ProspectingLead["contacts"]["emailCandidates"][number];

export function formatEmailCandidateStatus(candidate: EmailCandidate): string {
  if (candidate.source === "official_website") {
    return "web oficial, sin verificación externa";
  }
  const labels = {
    unverified: "sin verificación externa",
    valid: "verificado",
    risky: "riesgoso",
    invalid: "inválido",
    pending: "verificando",
    unknown: "no verificado todavía",
  } satisfies Record<EmailCandidate["verificationStatus"], string>;
  return labels[candidate.verificationStatus];
}
