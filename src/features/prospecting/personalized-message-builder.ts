import type {
  PersonalizedMessageDraft,
  WebsiteResearch,
} from "./prospecting-types";

type MessageDecisionMaker = { name: string; role: string };

export function buildPersonalizedMessage(input: {
  companyName: string;
  decisionMaker: MessageDecisionMaker | null;
  signal: WebsiteResearch["signals"][number] | null;
}): PersonalizedMessageDraft | null {
  if (!input.signal) return null;

  const firstName = input.decisionMaker?.name.split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName}, ` : "Hola, ";
  const observations: Record<string, string> = {
    whatsapp_booking: `${input.companyName} ofrece turnos o consultas por WhatsApp`,
    appointment_form: `${input.companyName} recibe turnos o consultas mediante un formulario web`,
    multiple_branches: `${input.companyName} informa atención en más de una sucursal`,
  };
  const observation =
    observations[input.signal.kind] ??
    `${input.companyName} publica esta señal: ${lowercaseFirst(input.signal.statement)}`;
  const hypothesis =
    input.signal.kind === "multiple_branches"
      ? "Con más de una sede, centralizar consultas y seguimientos podría reducir trabajo manual y respuestas demoradas."
      : "Cuando las consultas llegan por distintos canales, automatizar parte del seguimiento podría reducir trabajo manual sin cambiar la atención clínica.";
  const cta = "¿Tiene sentido verlo 15 minutos?";

  return {
    subject: `Seguimiento de consultas en ${input.companyName}`,
    body: `${greeting}vi que ${observation}. ${hypothesis} Podemos revisar sin costo dónde conviene automatizar y mostrar una prueba pequeña; sólo avanzaríamos si aparece un impacto medible. ${cta}`,
    cta,
    evidenceUrls: [input.signal.sourceUrl],
    confidence: input.signal.confidence,
    warnings: ["La necesidad operativa es una hipótesis que debe validarse con el prospecto."],
  };
}

function lowercaseFirst(value: string): string {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}
