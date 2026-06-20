import { z } from "zod";
import { isIP } from "node:net";

export const companyInputSchema = z.object({
  workspaceId: z.string().min(1),
  domain: z.string().min(1),
  name: z.string().trim().min(1),
});

export const companyRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  normalizedDomain: z.string().min(1),
  displayDomain: z.string().min(1),
  name: z.string().trim().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().min(1),
});

export type CompanyInput = z.input<typeof companyInputSchema>;
export type CompanyRecord = z.output<typeof companyRecordSchema>;

export function normalizeCompanyDomain(domain: string): string {
  const trimmed = domain.trim();
  const explicitScheme = trimmed.match(/^([a-z][a-z\d+.-]*):/i)?.[1];

  if (
    explicitScheme &&
    explicitScheme.toLowerCase() !== "http" &&
    explicitScheme.toLowerCase() !== "https"
  ) {
    throw new Error("Company domain must use HTTP or HTTPS");
  }

  const candidate = explicitScheme ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Company domain must use HTTP or HTTPS");
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
  const ipCandidate = hostname.replace(/^\[|\]$/g, "");
  const labels = hostname.split(".");

  if (
    hostname === "localhost" ||
    isIP(ipCandidate) !== 0 ||
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label),
    )
  ) {
    throw new Error("Invalid public company domain");
  }

  return hostname;
}
