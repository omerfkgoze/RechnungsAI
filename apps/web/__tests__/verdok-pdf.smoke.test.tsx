// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { assembleVerdokData } from "@rechnungsai/gobd";
import { registerFonts } from "../lib/pdf/fonts";
import { VerdokTemplate } from "../lib/pdf/verdok-template";

const TENANT = {
  company_name: "Müller & Größler GmbH",
  company_address: "Hauptstraße 1, 10115 Berlin",
  tax_id: "DE123456789",
  skr_plan: "SKR03",
  datev_berater_nr: "1234567",
  datev_mandanten_nr: "10001",
  datev_sachkontenlaenge: 4,
  datev_fiscal_year_start: 1,
  datev_default_kreditorenkonto: "70000",
  steuerberater_name: "Dr. Schäfer",
};

const SOFTWARE = {
  appName: "RechnungsAI",
  appVersion: "0.1.0",
  aiProvider: "OpenAI",
  aiModel: "gpt-4o-mini",
};

describe("VerdokTemplate render smoke", () => {
  beforeAll(() => {
    registerFonts();
  });

  it("renders a valid PDF buffer with %PDF- header", async () => {
    const data = assembleVerdokData(TENANT, SOFTWARE, "2026-05-16T12:00:00.000Z");
    const buffer = await renderToBuffer(
      createElement(VerdokTemplate, { data }) as Parameters<typeof renderToBuffer>[0],
    );

    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("embeds a font subset (NotoSans) so umlauts are not dropped", async () => {
    const data = assembleVerdokData(TENANT, SOFTWARE, "2026-05-16T12:00:00.000Z");
    const buffer = await renderToBuffer(
      createElement(VerdokTemplate, { data }) as Parameters<typeof renderToBuffer>[0],
    );

    // A PDF that embedded the NotoSans subset references the font in its
    // object table. (ASCII-only Helvetica fallback would omit this.)
    const haystack = buffer.toString("latin1");
    expect(haystack).toContain("FontFile");
    expect(haystack.toLowerCase()).toContain("notosans");
  });
});
