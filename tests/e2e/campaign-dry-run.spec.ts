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
  await page.getByRole("button", { name: "Preparar discovery" }).click();

  await expect(page.getByText("Lista para discovery")).toBeVisible();
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
    page.getByRole("link", { name: "Ver dossier de Logística Pampa" }),
  ).toHaveAttribute("href", /\/dossiers\/.+/);
});
