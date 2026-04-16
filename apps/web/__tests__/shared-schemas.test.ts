import { describe, expect, it } from "vitest";
import {
  loginSchema,
  signupSchema,
  tenantSettingsSchema,
  onboardingSetupSchema,
} from "@rechnungsai/shared";

// Smoke tests: verify @rechnungsai/shared resolves correctly from apps/web
// and that compiled dist/ output is importable by Vitest (P7 regression guard).

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "geheim123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "test@example.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({
      email: "test@example.com",
      password: "geheim123",
      passwordConfirm: "anders456",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("passwordConfirm");
    }
  });
});

describe("tenantSettingsSchema", () => {
  it("normalises company_name whitespace", () => {
    const result = tenantSettingsSchema.safeParse({
      company_name: "  Mustermann GmbH  ",
      company_address: "",
      tax_id: "",
      skr_plan: "SKR03",
      steuerberater_name: "",
      datev_berater_nr: "",
      datev_mandanten_nr: "",
      datev_sachkontenlaenge: 4,
      datev_fiscal_year_start: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.company_name).toBe("Mustermann GmbH");
    }
  });

  it("rejects invalid USt-IdNr format", () => {
    const result = tenantSettingsSchema.safeParse({
      company_name: "Test GmbH",
      company_address: "",
      tax_id: "INVALID",
      skr_plan: "SKR03",
      steuerberater_name: "",
      datev_berater_nr: "",
      datev_mandanten_nr: "",
      datev_sachkontenlaenge: 4,
      datev_fiscal_year_start: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("onboardingSetupSchema", () => {
  it("requires disclaimer_accepted to be true", () => {
    const result = onboardingSetupSchema.safeParse({
      disclaimer_accepted: false,
      company_name: "Test GmbH",
      skr_plan: "SKR03",
      steuerberater_name: "",
    });
    expect(result.success).toBe(false);
  });
});
