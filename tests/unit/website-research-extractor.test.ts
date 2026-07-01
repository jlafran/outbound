import { describe, expect, it } from "vitest";

import { WebsiteResearchExtractor } from "@/features/prospecting/website-research-extractor";

describe("WebsiteResearchExtractor", () => {
  it("extracts contacts, people, services and evidence from official pages", () => {
    const extractor = new WebsiteResearchExtractor();
    const result = extractor.extract({
      pages: [
        {
          requestedUrl: "https://clinica.com.ar/equipo",
          finalUrl: "https://clinica.com.ar/equipo",
          status: "fetched",
          title: "Equipo | Clínica Sonrisa",
          html: `
            <html><head>
              <meta property="og:site_name" content="Clínica Sonrisa">
              <meta name="description" content="Odontología integral en Palermo">
            </head><body>
              <address>Av. Santa Fe 3200, Palermo, Buenos Aires</address>
              <section class="team-member">
                <h2>Dra. Ana Pérez</h2>
                <p>Directora odontológica</p>
                <a href="mailto:ana@clinica.com.ar">Email</a>
              </section>
              <ul class="services"><li>Implantes dentales</li><li>Ortodoncia invisible</li></ul>
              <a href="https://linkedin.com/company/clinica-sonrisa">LinkedIn</a>
              <a href="https://instagram.com/clinica.sonrisa">Instagram</a>
            </body></html>
          `,
        },
        {
          requestedUrl: "https://clinica.com.ar/contacto",
          finalUrl: "https://clinica.com.ar/contacto",
          status: "fetched",
          title: "Turnos",
          html: `
            <main>
              <h1>Solicitá tu turno</h1>
              <p>Reservá por WhatsApp o completá el formulario.</p>
              <a href="https://wa.me/5491123456789">WhatsApp</a>
              <a href="tel:+541145678900">Llamanos</a>
              <form><input name="nombre"><button>Enviar consulta</button></form>
              <p>También atendemos en nuestra sucursal Belgrano.</p>
            </main>
          `,
        },
      ],
    });

    expect(result).toMatchObject({
      status: "completed",
      companyName: "Clínica Sonrisa",
      description: "Odontología integral en Palermo",
      location: "Av. Santa Fe 3200, Palermo, Buenos Aires",
      contacts: {
        emails: ["ana@clinica.com.ar"],
        phones: expect.arrayContaining(["5491123456789", "541145678900"]),
        whatsapps: ["5491123456789"],
        linkedinUrls: ["https://linkedin.com/company/clinica-sonrisa"],
        instagramUrls: ["https://instagram.com/clinica.sonrisa"],
      },
      people: [
        {
          name: "Ana Pérez",
          role: "Directora odontológica",
          email: "ana@clinica.com.ar",
          sourceUrl: "https://clinica.com.ar/equipo",
        },
      ],
      services: expect.arrayContaining([
        "Implantes dentales",
        "Ortodoncia invisible",
      ]),
      branchCount: 2,
    });
    expect(result.signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "whatsapp_booking" }),
        expect.objectContaining({ kind: "appointment_form" }),
        expect.objectContaining({ kind: "multiple_branches" }),
      ]),
    );
    expect(result.signals.every(({ sourceUrl }) => sourceUrl.startsWith("https://clinica.com.ar"))).toBe(true);
  });

  it("marks a script-only shell as requiring JavaScript", () => {
    const extractor = new WebsiteResearchExtractor();

    const result = extractor.extract({
      pages: [
        {
          requestedUrl: "https://spa.example/",
          finalUrl: "https://spa.example/",
          status: "fetched",
          html: '<div id="root"></div><script src="a.js"></script><script src="b.js"></script>',
        },
      ],
    });

    expect(result.status).toBe("failed");
    expect(result.pages[0].status).toBe("javascript_required");
  });

  it("rejects malformed emails extracted from noisy official pages", () => {
    const extractor = new WebsiteResearchExtractor();

    const result = extractor.extract({
      pages: [
        {
          requestedUrl: "https://clinica.com.ar/contacto",
          finalUrl: "https://clinica.com.ar/contacto",
          status: "fetched",
          html: `
            <main>
              <p>%20consultas@clinica.com.ar</p>
              <p>saludcontactohola@zurodental.com.ar</p>
              <p>8162emailhola@zurodental.com.ardireccion</p>
              <a href="mailto:%20turnos@clinica.com.ar?subject=Turno">Turnos</a>
              <a href="mailto:ana.perez@clinica.com.ar">Ana</a>
            </main>
          `,
        },
      ],
    });

    expect(result.contacts.emails).toEqual([
      "turnos@clinica.com.ar",
      "ana.perez@clinica.com.ar",
    ]);
  });

  it("finds decision makers in about and staff-style sections", () => {
    const extractor = new WebsiteResearchExtractor();

    const result = extractor.extract({
      pages: [
        {
          requestedUrl: "https://clinica.com.ar/nosotros",
          finalUrl: "https://clinica.com.ar/nosotros",
          status: "fetched",
          html: `
            <section class="about-card">
              <h3>Dr. Martín Torres</h3>
              <p>CEO y director general de la clínica.</p>
            </section>
            <section class="staff-card">
              <strong>Dra. Lucía García</strong>
              <p>Responsable comercial</p>
            </section>
          `,
        },
      ],
    });

    expect(result.people).toEqual([
      expect.objectContaining({
        name: "Martín Torres",
        role: "Director general/CEO",
      }),
      expect.objectContaining({
        name: "Lucía García",
        role: "Responsable comercial/marketing",
      }),
    ]);
  });
});
