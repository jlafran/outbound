import { describe, expect, it } from "vitest";

import { formatEmailCandidateStatus } from "@/features/prospecting/email-candidate-labels";

describe("formatEmailCandidateStatus", () => {
  it("renders official website emails without external verification language", () => {
    expect(
      formatEmailCandidateStatus({
        email: "ana@clinica.com.ar",
        source: "official_website",
        verificationStatus: "unverified",
      }),
    ).toBe("web oficial, sin verificación externa");
  });

  it("does not expose the raw unknown status", () => {
    expect(
      formatEmailCandidateStatus({
        email: "aperez@clinica.com.ar",
        source: "pattern",
        verificationStatus: "unknown",
      }),
    ).toBe("no verificado todavía");
  });
});
