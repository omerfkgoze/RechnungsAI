/**
 * Pure content assembly for the GoBD Verfahrensdokumentation (FR26).
 *
 * This module is intentionally free of React / PDF / network / DB code:
 * `@react-pdf/renderer` crashes when imported through Next.js App Router from
 * a monorepo package (spike P1, GitHub #3285). The Server Action fetches the
 * `tenants` row and the runtime facts, then calls {@link assembleVerdokData}
 * with plain values; `apps/web` owns rendering.
 */

/** The tenant settings subset that feeds the document content. */
export type VerdokTenantInput = {
  company_name: string | null;
  company_address: string | null;
  tax_id: string | null;
  skr_plan: string;
  datev_berater_nr: string | null;
  datev_mandanten_nr: string | null;
  datev_sachkontenlaenge: number;
  datev_fiscal_year_start: number;
  datev_default_kreditorenkonto: string | null;
  steuerberater_name: string | null;
};

/**
 * Runtime facts the pure layer cannot derive on its own. Passed in by the
 * Server Action so `packages/gobd` never imports `packages/ai` or reads
 * `apps/web` package.json — keeps this package dependency-free.
 */
export type VerdokSoftwareInfo = {
  /** Product name, e.g. "RechnungsAI". */
  appName: string;
  /** `apps/web` package.json version, e.g. "0.1.0". */
  appVersion: string;
  /** AI provider, e.g. "OpenAI" / "Google". */
  aiProvider: string;
  /** Extraction model, e.g. "gpt-4o-mini" / "gemini-2.5-flash". */
  aiModel: string;
};

/** One titled section of the document; `body` paragraphs render in order. */
export type VerdokSection = {
  heading: string;
  body: string[];
};

export type VerdokData = {
  /** Company name (or a neutral fallback) — used as PDF title/author. */
  tenantName: string;
  /** ISO timestamp the document was generated; rendered in the footer. */
  generatedAtIso: string;
  company: {
    name: string;
    address: string;
    taxId: string;
  };
  sections: VerdokSection[];
  /** Font-embedding smoke line — verifies ä ö ü ß render (AC3). */
  umlautSmoke: string;
};

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

function monthName(month: number): string {
  // datev_fiscal_year_start is 1-based (1 = Januar).
  return MONTHS_DE[month - 1] ?? "Januar";
}

function orFallback(value: string | null, fallback: string): string {
  const v = value?.trim();
  return v ? v : fallback;
}

function skrDescription(skrPlan: string): string {
  if (skrPlan === "SKR04") {
    return "SKR04 (Kontenrahmen nach Abschlussgliederungsprinzip)";
  }
  return "SKR03 (Kontenrahmen nach Prozessgliederungsprinzip)";
}

/**
 * Maps tenant settings + runtime facts to the document content model.
 *
 * Pure: no Date.now, no network, no DB. The caller passes `generatedAtIso`
 * so generation timestamps stay testable and consistent with the DB row.
 */
export function assembleVerdokData(
  tenant: VerdokTenantInput,
  software: VerdokSoftwareInfo,
  generatedAtIso: string,
): VerdokData {
  const companyName = orFallback(tenant.company_name, "Nicht angegeben");
  const companyAddress = orFallback(tenant.company_address, "Nicht angegeben");
  const taxId = orFallback(tenant.tax_id, "Nicht angegeben");
  const beraterNr = orFallback(tenant.datev_berater_nr, "—");
  const mandantenNr = orFallback(tenant.datev_mandanten_nr, "—");
  const kreditorenkonto = orFallback(tenant.datev_default_kreditorenkonto, "—");
  const steuerberater = orFallback(
    tenant.steuerberater_name,
    "Kein Steuerberater hinterlegt",
  );

  const sections: VerdokSection[] = [
    {
      heading: "1. Allgemeine Angaben zum Unternehmen",
      body: [
        `Unternehmen: ${companyName}`,
        `Anschrift: ${companyAddress}`,
        `Steuernummer / USt-IdNr.: ${taxId}`,
        `Verantwortlicher Steuerberater: ${steuerberater}`,
        "Diese Verfahrensdokumentation beschreibt das eingesetzte Verfahren " +
          "zur Erfassung, Verarbeitung, Prüfung und Aufbewahrung von " +
          "Eingangsrechnungen gemäß den Grundsätzen zur ordnungsmäßigen " +
          "Führung und Aufbewahrung von Büchern, Aufzeichnungen und " +
          "Unterlagen in elektronischer Form sowie zum Datenzugriff (GoBD).",
      ],
    },
    {
      heading: "2. Eingesetzte Software",
      body: [
        `Software: ${software.appName}, Version ${software.appVersion}`,
        `KI-gestützte Datenextraktion: ${software.aiProvider} (Modell: ${software.aiModel})`,
        "Die Software wird als Cloud-Anwendung betrieben. Die fachliche " +
          "Verantwortung für die gebuchten Daten verbleibt beim Unternehmen " +
          "bzw. dem beauftragten Steuerberater.",
      ],
    },
    {
      heading: "3. Belegerfassung und Datenverarbeitung",
      body: [
        "Der Verarbeitungsprozess gliedert sich in vier Schritte:",
        "1. Erfassung: Eingangsrechnungen werden als Foto, PDF, Bilddatei " +
          "oder strukturierte XML-Datei (ZUGFeRD / XRechnung) hochgeladen.",
        "2. KI-Extraktion: Die relevanten Rechnungsdaten (Rechnungssteller, " +
          "Beträge, Steuersätze, Datum) werden automatisiert ausgelesen.",
        "3. Prüfung: Jede extrahierte Rechnung wird dem Nutzer zur Kontrolle " +
          "vorgelegt; Felder können vor der Freigabe korrigiert werden.",
        "4. Freigabe: Erst nach ausdrücklicher Freigabe durch den Nutzer " +
          "gilt eine Rechnung als verbucht und wird unveränderbar archiviert.",
      ],
    },
    {
      heading: "4. Kontenrahmen und Buchungslogik",
      body: [
        `Verwendeter Kontenrahmen: ${skrDescription(tenant.skr_plan)}`,
        `DATEV Berater-Nr.: ${beraterNr}`,
        `DATEV Mandanten-Nr.: ${mandantenNr}`,
        `Sachkontenlänge: ${tenant.datev_sachkontenlaenge} Stellen`,
        `Beginn des Wirtschaftsjahres: ${monthName(tenant.datev_fiscal_year_start)}`,
        `Standard-Kreditorenkonto: ${kreditorenkonto}`,
        "Die Zuordnung von Aufwandskonten und Buchungsschlüsseln erfolgt " +
          "regelbasiert auf Grundlage des gewählten Kontenrahmens und wird " +
          "vor der Freigabe geprüft.",
      ],
    },
    {
      heading: "5. Archivierung und Unveränderbarkeit",
      body: [
        "Freigegebene Belege werden in einem revisionssicheren, privaten " +
          "Speicher abgelegt. Jedes Dokument wird beim Archivieren mit einem " +
          "SHA-256-Hash versiegelt; jede nachträgliche Änderung wäre damit " +
          "feststellbar (Unveränderbarkeit gemäß GoBD § 239 Abs. 3).",
        "Sämtliche Belege und Buchungsdaten werden für die gesetzliche " +
          "Aufbewahrungsfrist von 10 Jahren vorgehalten.",
        "Aktionen (Erfassung, Bearbeitung, Freigabe, Export) werden " +
          "lückenlos in einem nachvollziehbaren Audit-Trail protokolliert.",
      ],
    },
    {
      heading: "6. Zugriffsschutz",
      body: [
        "Der Zugang erfolgt ausschließlich über authentifizierte " +
          "Benutzerkonten (Supabase Auth).",
        "Eine strikte Mandantentrennung wird auf Datenbankebene durch " +
          "Row-Level-Security-Richtlinien (RLS) erzwungen: jeder Nutzer " +
          "kann ausschließlich auf die Daten des eigenen Mandanten zugreifen.",
      ],
    },
    {
      heading: "7. Datenschutz und Datensicherheit",
      body: [
        "Die Datenübertragung erfolgt ausschließlich verschlüsselt (TLS).",
        "Daten werden auf Servern innerhalb der Europäischen Union " +
          "(deutsches/EU-Hosting) gespeichert; die Vorgaben der DSGVO " +
          "werden eingehalten.",
        "Personenbezogene Daten werden nur im Rahmen der steuerlichen " +
          "Aufbewahrungspflichten und nur so lange wie erforderlich " +
          "verarbeitet.",
      ],
    },
  ];

  return {
    tenantName: companyName,
    generatedAtIso,
    company: {
      name: companyName,
      address: companyAddress,
      taxId,
    },
    sections,
    umlautSmoke: "Schriftprobe: ä ö ü ß Ä Ö Ü — Größe, Straße, Müller",
  };
}
