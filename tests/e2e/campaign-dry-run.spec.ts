import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await request.post("/api/e2e/reset");
});

test("validates the offer form and shows the simulation banner", async ({
  page,
}) => {
  await page.goto("/offers/new");

  await expect(
    page.getByText(
      "Modo simulación: no se enviarán emails ni se comprarán datos",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Guardar oferta" }).click();

  await expect(page.getByText("Ingresá un nombre")).toBeVisible();
  await expect(page.getByLabel("Nombre")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Nombre")).toHaveAttribute(
    "aria-describedby",
    "name-error",
  );
  await expect(page.locator("#name-error")).toContainText(
    "Ingresá un nombre",
  );
  await expect(
    page.getByText("Describí la solución con al menos 20 caracteres"),
  ).toBeVisible();
  await expect(page.getByText("Ingresá al menos un problema")).toBeVisible();
  await expect(
    page.getByText("Ingresá al menos un resultado esperado"),
  ).toBeVisible();
});

test("creates an offer and completes a campaign dry-run", async ({
  page,
}) => {
  await page.goto("/offers/new");
  await page.getByLabel("Nombre").fill("Agente de soporte");
  await page
    .getByLabel("Documento de la solución")
    .fill(
      "Automatiza consultas repetitivas, ordena el seguimiento y reduce tiempos de respuesta.",
    );
  await page
    .getByLabel("Problemas (uno por línea)")
    .fill("Consultas repetitivas\nSeguimiento manual");
  await page
    .getByLabel("Resultados esperados (uno por línea)")
    .fill("Menor tiempo de respuesta\nMayor capacidad operativa");
  await page.getByLabel("Ticket objetivo").selectOption("usd_15k_plus");
  await page
    .getByLabel("Piloto permitido")
    .fill("Piloto pago de cuatro semanas");
  await page
    .getByLabel("Promesas prohibidas (una por línea)")
    .fill("Resultados garantizados");
  await page.getByRole("button", { name: "Guardar oferta" }).click();

  await expect(
    page.getByRole("heading", { name: "Agente de soporte" }),
  ).toBeVisible();
  await expect(page.getByText("Consultas repetitivas")).toBeVisible();

  await page.getByRole("link", { name: "Crear campaña" }).click();
  await page.getByRole("button", { name: "Guardar campaña" }).click();
  await expect(page.getByLabel("Nombre de campaña")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Nombre de campaña")).toHaveAttribute(
    "aria-describedby",
    "name-error",
  );
  await expect(page.locator("#name-error")).toContainText(
    "Ingresá un nombre de campaña",
  );
  await expect(page.getByLabel("Emails diarios")).toHaveAttribute(
    "aria-describedby",
    "targetDailyEmails-error",
  );
  await page
    .getByLabel("Nombre de campaña")
    .fill("Argentina operaciones");
  await page.getByLabel("Emails diarios").fill("50");
  await page.getByLabel("Modo de datos").selectOption("fallback");
  await page.getByRole("button", { name: "Guardar campaña" }).click();

  await expect(
    page.getByRole("heading", { name: "Argentina operaciones" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recomendar nichos" }).click();

  for (const niche of ["Logística", "Software B2B", "Salud privada"]) {
    await expect(page.getByRole("heading", { name: niche })).toBeVisible();
  }
  await expect(page.getByText("Capacidad de pago")).toHaveCount(3);
  await expect(page.getByText("Claridad de ROI")).toHaveCount(3);

  await page.getByRole("button", { name: "Pasar a revisión" }).click();
  await expect(
    page.getByRole("button", { name: "Aprobar nichos" }),
  ).toBeDisabled();
  await page.getByLabel("Seleccionar Logística").check();
  await page.getByRole("button", { name: "Aprobar nichos" }).click();

  await expect(page.getByText("Lista para discovery")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preparar discovery" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Generar datos dry-run" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generar datos dry-run" })
    .click();

  const companies = page.getByRole("list", {
    name: "Empresas generadas",
  });
  await expect(companies.getByRole("listitem")).toHaveCount(3);
  await expect(
    companies.getByRole("listitem").first(),
  ).toContainText("Logística Pampa");
  await expect(
    page.getByRole("link", { name: "Ver estado del dossier" }),
  ).toHaveAttribute("href", /\/dossiers\/.+/);
  await Promise.all([
    page.waitForURL(/\/dossiers\/.+/),
    page.getByRole("link", { name: "Ver estado del dossier" }).click(),
  ]);
  const versionOneUrl = page.url();
  await expect(
    page.getByRole("heading", { name: "Dossier", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Versión 1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resumen ejecutivo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Empresa y modelo de negocio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Conversación" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hechos investigados" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hipótesis" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recomendaciones" }),
  ).toBeVisible();
  await expect(page.getByText("Confianza: alta").first()).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Fuente", exact: true }).first(),
  ).toHaveAttribute("href", /^https:\/\/example\.com\//);
  await expect(
    page.getByText("Supuestos", { exact: true }).first(),
  ).toBeVisible();

  const markdownV1 = page.getByRole("link", {
    name: "Exportar Markdown",
  });
  const pdfV1 = page.getByRole("link", { name: "Exportar PDF" });
  await expect(markdownV1).toHaveAttribute(
    "href",
    /\/api\/dossiers\/[^/]+\/markdown$/,
  );
  await expect(pdfV1).toHaveAttribute(
    "href",
    /\/api\/dossiers\/[^/]+\/pdf$/,
  );

  await page
    .getByRole("button", { name: "Editar recomendaciones" })
    .click();
  await page
    .getByLabel("Nueva recomendación")
    .fill("Priorizar automatización del triage de consultas.");
  await page
    .getByRole("button", { name: "Guardar nueva versión" })
    .last()
    .click();

  await expect(page.getByText("Versión 2", { exact: true })).toBeVisible();
  const recommendationArticle = page.getByRole("article", {
    name: "Priorizar automatización del triage de consultas.",
  });
  await expect(
    recommendationArticle
      .locator("p")
      .filter({ hasText: "Priorizar automatización del triage de consultas." }),
  ).toBeVisible();
  const versionTwoUrl = page.url();
  expect(versionTwoUrl).not.toBe(versionOneUrl);
  const versionTwoId = new URL(versionTwoUrl).pathname.split("/").at(-1);
  await expect(
    page.getByRole("link", { name: "Exportar Markdown" }),
  ).toHaveAttribute("href", `/api/dossiers/${versionTwoId}/markdown`);
  await expect(
    page.getByRole("link", { name: "Exportar PDF" }),
  ).toHaveAttribute("href", `/api/dossiers/${versionTwoId}/pdf`);

  const markdownResponse = await page.request.get(
    `/api/dossiers/${versionTwoId}/markdown`,
  );
  expect(markdownResponse.status()).toBe(200);
  expect(markdownResponse.headers()["content-type"]).toContain(
    "text/markdown",
  );
  expect(await markdownResponse.text()).toContain(
    "# Dossier previo a la reunión",
  );

  const [markdownDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exportar Markdown" }).click(),
  ]);
  const markdownPath = await markdownDownload.path();
  expect(markdownPath).not.toBeNull();
  if (!markdownPath) {
    throw new Error("Expected Markdown download path");
  }
  expect(await readFile(markdownPath, "utf8")).toContain(
    "# Dossier previo a la reunión",
  );

  const pdfResponse = await page.request.get(`/api/dossiers/${versionTwoId}/pdf`);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
  expect(Buffer.from(await pdfResponse.body()).subarray(0, 5).toString()).toBe(
    "%PDF-",
  );

  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exportar PDF" }).click(),
  ]);
  const pdfPath = await pdfDownload.path();
  expect(pdfPath).not.toBeNull();
  if (!pdfPath) {
    throw new Error("Expected PDF download path");
  }
  expect(
    Buffer.from(await readFile(pdfPath)).subarray(0, 5).toString(),
  ).toBe("%PDF-");

  const originalHypothesis =
    "La coordinación entre tráfico y atención al cliente podría incluir tareas manuales repetitivas.";
  const editedHypothesis =
    "La coordinación entre tráfico y atención al cliente requiere automatización del triage.";
  const hypothesisEditor = page.locator(
    `details[aria-label="Editar elemento: ${originalHypothesis}"]`,
  );
  await hypothesisEditor.locator("summary").click();
  await hypothesisEditor.getByLabel("Declaración").fill(editedHypothesis);
  await hypothesisEditor
    .getByRole("button", { name: "Guardar nueva versión" })
    .click();

  await expect(page.getByText("Versión 3", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("article", { name: editedHypothesis })
      .locator("p")
      .filter({ hasText: editedHypothesis }),
  ).toBeVisible();
  const versionThreeUrl = page.url();
  expect(versionThreeUrl).not.toBe(versionTwoUrl);

  await page.goto(versionOneUrl);
  await expect(page.getByText("Versión 1", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("article", { name: originalHypothesis })
      .locator("p")
      .filter({ hasText: originalHypothesis }),
  ).toBeVisible();
  await expect(page.getByText(editedHypothesis)).toHaveCount(0);

  await page.goto(versionThreeUrl);
  const addedRecommendation = page.getByRole("article", {
    name: "Priorizar automatización del triage de consultas.",
  });
  await addedRecommendation
    .getByRole("button", { name: "Ocultar" })
    .click();

  await expect(page.getByText("Versión 4", { exact: true })).toBeVisible();
  const hiddenRecommendation = page.getByRole("article", {
    name: "Priorizar automatización del triage de consultas.",
  });
  await expect(hiddenRecommendation.locator(".hidden-marker")).toBeVisible();
  await expect(
    hiddenRecommendation.getByRole("button", { name: "Ocultar" }),
  ).toHaveCount(0);
});
