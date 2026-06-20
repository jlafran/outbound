import { z } from "zod";
import { Buffer } from "node:buffer";
import { isIP } from "node:net";

const companyNameSchema = z
  .string()
  .trim()
  .min(1)
  .transform((name) => name.normalize("NFC"));

export const companyInputSchema = z.object({
  workspaceId: z.string().min(1),
  domain: z.string().min(1),
  name: companyNameSchema,
});

export const companyRecordSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  normalizedDomain: z.string().min(1),
  displayDomain: z.string().min(1),
  name: companyNameSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().min(1),
});

export type CompanyInput = z.input<typeof companyInputSchema>;
export type CompanyRecord = z.output<typeof companyRecordSchema>;

const specialUseSuffixes = new Set([
  "local",
  "localhost",
  "test",
  "invalid",
  "example",
  "internal",
  "lan",
  "home",
  "corp",
  "onion",
]);

function normalizeCompanyName(name: string): string {
  return name.trim().normalize("NFC");
}

export function selectCanonicalCompanyName(
  current: string,
  incoming: string,
): string {
  const normalizedCurrent = normalizeCompanyName(current);
  const normalizedIncoming = normalizeCompanyName(incoming);
  const currentLength = Array.from(normalizedCurrent).length;
  const incomingLength = Array.from(normalizedIncoming).length;

  if (incomingLength !== currentLength) {
    return incomingLength > currentLength
      ? normalizedIncoming
      : normalizedCurrent;
  }

  // UTF-8 binary order matches PostgreSQL's C-collation tie-break.
  return Buffer.compare(
    Buffer.from(normalizedIncoming, "utf8"),
    Buffer.from(normalizedCurrent, "utf8"),
  ) > 0
    ? normalizedIncoming
    : normalizedCurrent;
}

export function normalizeCompanyDomain(domain: string): string {
  const trimmed = domain.trim();
  const bareHostWithPort = /^[^/?#:@]+:\d+(?:[/?#]|$)/.test(trimmed);
  const explicitUrlScheme = trimmed.match(
    /^([a-z][a-z\d+.-]*):\/\//i,
  )?.[1];
  const otherScheme = bareHostWithPort
    ? undefined
    : trimmed.match(/^([a-z][a-z\d+.-]*):/i)?.[1];

  if (
    (explicitUrlScheme &&
      explicitUrlScheme.toLowerCase() !== "http" &&
      explicitUrlScheme.toLowerCase() !== "https") ||
    (otherScheme &&
      otherScheme.toLowerCase() !== "http" &&
      otherScheme.toLowerCase() !== "https")
  ) {
    throw new Error("Company domain must use HTTP or HTTPS");
  }

  const candidate = explicitUrlScheme ? trimmed : `https://${trimmed}`;
  const url = new URL(candidate);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Company domain must use HTTP or HTTPS");
  }

  if (url.username || url.password) {
    throw new Error("Company domain must not include credentials");
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
    specialUseSuffixes.has(labels.at(-1) ?? "") ||
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
