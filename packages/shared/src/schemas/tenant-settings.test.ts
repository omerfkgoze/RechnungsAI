import { describe, expect, it } from "vitest";
import { tenantSettingsSchema } from "./tenant-settings.js";

const BASE_VALID = {
  company_name: "Mustermann GmbH",
  company_address: null,
  tax_id: null,
  skr_plan: "SKR03" as const,
  steuerberater_name: null,
  datev_berater_nr: null,
  datev_mandanten_nr: null,
  datev_sachkontenlaenge: 4,
  datev_fiscal_year_start: 1,
  datev_default_kreditorenkonto: null,
};

describe("tenantSettingsSchema", () => {
  // (a) valid full input parses and is idempotent
  it("(a) parses valid full input and is idempotent", () => {
    const result = tenantSettingsSchema.safeParse(BASE_VALID);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // re-parse output (idempotency)
    const result2 = tenantSettingsSchema.safeParse(result.data);
    expect(result2.success).toBe(true);
  });

  // (b) company_name empty → error
  it("(b) company_name empty → Firmenname ist zu kurz.", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, company_name: "" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Firmenname ist zu kurz.");
  });

  // (c) tax_id with whitespace normalises and parses
  it("(c) tax_id with whitespace normalises to DE123456789", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, tax_id: "DE 123 456 789" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.tax_id).toBe("DE123456789");
  });

  // (d) invalid tax_id format
  it("(d) tax_id = XX123 → USt-IdNr. error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, tax_id: "XX123" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("USt-IdNr. muss mit DE beginnen und 9 Ziffern enthalten.");
  });

  // (e) datev_berater_nr alpha → error
  it("(e) datev_berater_nr = abc → Berater-Nr. error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_berater_nr: "abc" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Berater-Nr. darf nur Ziffern enthalten (max. 7).");
  });

  // (f) datev_berater_nr 8 digits (max is 7) → error
  it("(f) datev_berater_nr = 12345678 (8 digits) → Berater-Nr. error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_berater_nr: "12345678" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Berater-Nr. darf nur Ziffern enthalten (max. 7).");
  });

  // (g) datev_berater_nr empty → null
  it("(g) datev_berater_nr = '' → null", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_berater_nr: "" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.datev_berater_nr).toBeNull();
  });

  // (h) datev_mandanten_nr 6 digits (max is 5) → error
  it("(h) datev_mandanten_nr = 123456 (6 digits) → Mandanten-Nr. error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_mandanten_nr: "123456" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Mandanten-Nr. darf nur Ziffern enthalten (max. 5).");
  });

  // (i) datev_sachkontenlaenge = 3 → error
  it("(i) datev_sachkontenlaenge = 3 → Sachkontenlänge error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_sachkontenlaenge: 3 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Sachkontenlänge muss zwischen 4 und 8 liegen.");
  });

  // (j) datev_sachkontenlaenge = 9 → error
  it("(j) datev_sachkontenlaenge = 9 → Sachkontenlänge error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_sachkontenlaenge: 9 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Sachkontenlänge muss zwischen 4 und 8 liegen.");
  });

  // (k) datev_sachkontenlaenge as string "5" → coerces to number 5
  it("(k) datev_sachkontenlaenge = '5' (string) → coerces to number 5", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_sachkontenlaenge: "5" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.datev_sachkontenlaenge).toBe(5);
  });

  // (l) datev_fiscal_year_start = 0 and 13 → error
  it("(l) datev_fiscal_year_start out of range (0 and 13) → Geschäftsjahr error", () => {
    for (const val of [0, 13]) {
      const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_fiscal_year_start: val });
      expect(result.success).toBe(false);
      if (result.success) return;
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain("Geschäftsjahr-Beginn muss ein Monat zwischen 1 und 12 sein.");
    }
  });

  // (m) datev_default_kreditorenkonto = "70000" → parses
  it("(m) datev_default_kreditorenkonto = '70000' → parses", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_default_kreditorenkonto: "70000" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.datev_default_kreditorenkonto).toBe("70000");
  });

  // (n) datev_default_kreditorenkonto = "1234" (4 digits) → error
  it("(n) datev_default_kreditorenkonto = '1234' (4 digits) → Kreditorenkonto error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_default_kreditorenkonto: "1234" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Kreditorenkonto darf nur Ziffern enthalten (5–9 Stellen).");
  });

  // (o) datev_default_kreditorenkonto = "1234567890" (10 digits) → error
  it("(o) datev_default_kreditorenkonto = '1234567890' (10 digits) → Kreditorenkonto error", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_default_kreditorenkonto: "1234567890" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = result.error.issues.map((i) => i.message);
    expect(messages).toContain("Kreditorenkonto darf nur Ziffern enthalten (5–9 Stellen).");
  });

  // (p) datev_default_kreditorenkonto = "" → null
  it("(p) datev_default_kreditorenkonto = '' → null", () => {
    const result = tenantSettingsSchema.safeParse({ ...BASE_VALID, datev_default_kreditorenkonto: "" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.datev_default_kreditorenkonto).toBeNull();
  });
});
