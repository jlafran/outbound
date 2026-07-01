import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  test: {
    environment: "node",
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/.git/**"],
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/outreach",
      AUTH_SECRET: "test-auth-secret-with-at-least-32-characters",
      ALLOWED_EMAILS: "admin@example.com",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
