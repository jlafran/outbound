import { describe, expect, it } from "vitest";

import { parseEnv } from "@/lib/env";

const validEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/outreach",
  AUTH_SECRET: "a".repeat(32),
  ALLOWED_EMAILS: "ADMIN@example.com, user@example.com ",
};

describe("parseEnv", () => {
  it("applies the localhost application URL by default", () => {
    expect(parseEnv(validEnv).APP_URL).toBe("http://localhost:3000");
  });

  it("normalizes the comma-separated allowed email list", () => {
    expect(parseEnv(validEnv).ALLOWED_EMAILS).toEqual([
      "admin@example.com",
      "user@example.com",
    ]);
  });

  it("rejects an invalid database URL", () => {
    expect(() =>
      parseEnv({ ...validEnv, DATABASE_URL: "not-a-url" }),
    ).toThrow();
  });

  it("rejects an authentication secret shorter than 32 characters", () => {
    expect(() => parseEnv({ ...validEnv, AUTH_SECRET: "too-short" })).toThrow();
  });
});
