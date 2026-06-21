import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function isPdfSmokeRequired(environment) {
  return (
    Object.prototype.hasOwnProperty.call(environment, "CI") ||
    environment.REQUIRE_PDF_SMOKE === "1"
  );
}

function runPdfSmoke() {
  const pnpmExecutable =
    process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    pnpmExecutable,
    [
      "vitest",
      "run",
      "tests/integration/dossier-export.test.ts",
      "-t",
      "real Chromium smoke",
    ],
    {
      env: {
        ...process.env,
        REQUIRE_PDF_SMOKE: "1",
      },
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  process.exitCode = result.status ?? 1;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  runPdfSmoke();
}
