import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
  },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1",
    env: {
      ...process.env,
      OUTREACH_E2E_MODE: "1",
      DATABASE_URL:
        "postgresql://postgres:postgres@127.0.0.1:5432/outreach_e2e_unused",
      AUTH_SECRET: "e2e-auth-secret-with-at-least-32-characters",
      ALLOWED_EMAILS: "e2e@example.com",
      APP_URL: "http://127.0.0.1:3000",
    },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
  },
});
