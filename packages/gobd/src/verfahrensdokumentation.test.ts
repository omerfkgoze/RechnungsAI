import { describe, expect, it } from "vitest";
import {
  assembleVerdokData,
  type VerdokSoftwareInfo,
  type VerdokTenantInput,
} from "./verfahrensdokumentation.js";

const TENANT: VerdokTenantInput = {
  company_name: "Müller GmbH",
  company_address: "Hauptstraße 1, 10115 Berlin",
  tax_id: "DE123456789",
  skr_plan: "SKR03",
  datev_berater_nr: "1234567",
  datev_mandanten_nr: "10001",
  datev_sachkontenlaenge: 4,
  datev_fiscal_year_start: 1,
  datev_default_kreditorenkonto: "70000",
  steuerberater_name: "Dr. Schmidt",
};

const SOFTWARE: VerdokSoftwareInfo = {
  appName: "RechnungsAI",
  appVersion: "0.1.0",
  aiProvider: "OpenAI",
  aiModel: "gpt-4o-mini",
};

const ISO = "2026-05-16T12:00:00.000Z";

describe("assembleVerdokData", () => {
  it("returns a well-formed VerdokData with all GoBD sections", () => {
    const data = assembleVerdokData(TENANT, SOFTWARE, ISO);

    expect(data.tenantName).toBe("Müller GmbH");
    expect(data.generatedAtIso).toBe(ISO);
    expect(data.company).toEqual({
      name: "Müller GmbH",
      address: "Hauptstraße 1, 10115 Berlin",
      taxId: "DE123456789",
    });
    // 7 GoBD sections: company, software, workflow, accounts, archiving,
    // access control, data protection.
    expect(data.sections).toHaveLength(7);
    for (const s of data.sections) {
      expect(s.heading.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it("injects tenant fields into the rendered prose", () => {
    const data = assembleVerdokData(TENANT, SOFTWARE, ISO);
    const flat = data.sections.flatMap((s) => s.body).join("\n");

    expect(flat).toContain("Müller GmbH");
    expect(flat).toContain("DE123456789");
    expect(flat).toContain("1234567"); // Berater-Nr.
    expect(flat).toContain("Dr. Schmidt");
    expect(flat).toContain("SKR03");
    expect(flat).toContain("Januar"); // fiscal year start month name
  });

  it("reflects the passed-in software/AI facts (no packages/ai import)", () => {
    const data = assembleVerdokData(
      TENANT,
      { appName: "RechnungsAI", appVersion: "9.9.9", aiProvider: "Google", aiModel: "gemini-2.5-flash" },
      ISO,
    );
    const flat = data.sections.flatMap((s) => s.body).join("\n");
    expect(flat).toContain("9.9.9");
    expect(flat).toContain("Google");
    expect(flat).toContain("gemini-2.5-flash");
  });

  it("maps SKR04 plan description distinctly from SKR03", () => {
    const d3 = assembleVerdokData(TENANT, SOFTWARE, ISO);
    const d4 = assembleVerdokData({ ...TENANT, skr_plan: "SKR04" }, SOFTWARE, ISO);
    expect(d3.sections.flatMap((s) => s.body).join()).toContain("SKR03");
    expect(d4.sections.flatMap((s) => s.body).join()).toContain("SKR04");
  });

  it("substitutes neutral German fallbacks for missing optional fields", () => {
    const sparse: VerdokTenantInput = {
      ...TENANT,
      company_name: null,
      company_address: null,
      tax_id: null,
      steuerberater_name: null,
      datev_berater_nr: null,
    };
    const data = assembleVerdokData(sparse, SOFTWARE, ISO);
    expect(data.tenantName).toBe("Nicht angegeben");
    expect(data.company.name).toBe("Nicht angegeben");
    const flat = data.sections.flatMap((s) => s.body).join("\n");
    expect(flat).toContain("Nicht angegeben");
    expect(flat).toContain("Kein Steuerberater hinterlegt");
  });

  it("carries an umlaut smoke line for font-embedding verification", () => {
    const data = assembleVerdokData(TENANT, SOFTWARE, ISO);
    expect(data.umlautSmoke).toMatch(/ä.*ö.*ü.*ß/);
  });

  it("maps a non-January fiscal year start to the correct month name", () => {
    const data = assembleVerdokData(
      { ...TENANT, datev_fiscal_year_start: 7 },
      SOFTWARE,
      ISO,
    );
    expect(data.sections.flatMap((s) => s.body).join("\n")).toContain("Juli");
  });
});
