import { describe, expect, it } from "vitest";

import { formatProspectingRunTime } from "@/features/prospecting/prospecting-time-format";

describe("formatProspectingRunTime", () => {
  it("formats persisted run timestamps in Buenos Aires time", () => {
    expect(formatProspectingRunTime(new Date("2026-07-01T15:30:00.000Z"))).toContain(
      "12:30",
    );
  });
});
