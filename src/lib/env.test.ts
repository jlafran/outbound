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

  it("uses NEXTAUTH_URL as APP_URL when APP_URL is absent", () => {
    expect(
      parseEnv({
        ...validEnv,
        NEXTAUTH_URL: "https://outreach.example.com",
      }).APP_URL,
    ).toBe("https://outreach.example.com");
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

  it("allows auth provider secrets to be absent at import and build time", () => {
    const parsed = parseEnv({
      DATABASE_URL: validEnv.DATABASE_URL,
      ALLOWED_EMAILS: "",
    });

    expect(parsed.ALLOWED_EMAILS).toEqual([]);
    expect(parsed.AUTH_SECRET).toBeUndefined();
    expect(parsed.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(parsed.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(parsed.DEV_AUTH_PASSWORD).toBeUndefined();
    expect(parsed.NEXTAUTH_URL).toBeUndefined();
  });

  it("accepts optional Google and development credential configuration", () => {
    const parsed = parseEnv({
      ...validEnv,
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      DEV_AUTH_PASSWORD: "development-password",
      NEXTAUTH_URL: "https://outreach.example.com",
    });

    expect(parsed).toMatchObject({
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
      DEV_AUTH_PASSWORD: "development-password",
      NEXTAUTH_URL: "https://outreach.example.com",
    });
  });

  it("rejects an invalid optional NEXTAUTH_URL", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        NEXTAUTH_URL: "not-a-url",
      }),
    ).toThrow();
  });

  it("rejects a configured development password shorter than 12 characters", () => {
    expect(() =>
      parseEnv({
        ...validEnv,
        DEV_AUTH_PASSWORD: "too-short",
      }),
    ).toThrow();
  });
});
