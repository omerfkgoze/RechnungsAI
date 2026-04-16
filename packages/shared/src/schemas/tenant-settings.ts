import { z } from "zod";
import { normalizeName } from "./_normalize.js";
import { SKR_PLANS } from "./onboarding.js";

const normalizeToNull = (value: string) => {
  const cleaned = normalizeName(value);
  return cleaned.length === 0 ? null : cleaned;
};

export const tenantSettingsSchema = z.object({
  company_name: z
    .string()
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .min(2, { message: "Firmenname ist zu kurz." })
        .max(100, { message: "Firmenname ist zu lang." }),
    ),

  company_address: z
    .string()
    .transform(normalizeToNull)
    .pipe(
      z
        .string()
        .max(500, { message: "Adresse ist zu lang." })
        .nullable(),
    ),

  tax_id: z
    .string()
    .transform((v) => {
      const cleaned = normalizeName(v).replace(/\s+/g, "").toUpperCase();
      return cleaned.length === 0 ? null : cleaned;
    })
    .pipe(
      z
        .string()
        .regex(/^DE[0-9]{9}$/, {
          message: "USt-IdNr. muss mit DE beginnen und 9 Ziffern enthalten.",
        })
        .nullable(),
    ),

  skr_plan: z.enum(SKR_PLANS, {
    errorMap: () => ({ message: "Bitte wähle SKR03 oder SKR04." }),
  }),

  steuerberater_name: z
    .string()
    .transform(normalizeToNull)
    .pipe(
      z
        .string()
        .max(100, { message: "Name ist zu lang." })
        .nullable(),
    ),

  datev_berater_nr: z
    .string()
    .transform((v) => {
      const cleaned = normalizeName(v);
      return cleaned.length === 0 ? null : cleaned;
    })
    .pipe(
      z
        .string()
        .regex(/^[0-9]{1,7}$/, {
          message: "Berater-Nr. darf nur Ziffern enthalten (max. 7).",
        })
        .nullable(),
    ),

  datev_mandanten_nr: z
    .string()
    .transform((v) => {
      const cleaned = normalizeName(v);
      return cleaned.length === 0 ? null : cleaned;
    })
    .pipe(
      z
        .string()
        .regex(/^[0-9]{1,5}$/, {
          message: "Mandanten-Nr. darf nur Ziffern enthalten (max. 5).",
        })
        .nullable(),
    ),

  datev_sachkontenlaenge: z.coerce
    .number()
    .int()
    .min(4, { message: "Sachkontenlänge muss zwischen 4 und 8 liegen." })
    .max(8, { message: "Sachkontenlänge muss zwischen 4 und 8 liegen." }),

  datev_fiscal_year_start: z.coerce
    .number()
    .int()
    .min(1, { message: "Geschäftsjahr-Beginn muss ein Monat zwischen 1 und 12 sein." })
    .max(12, {
      message: "Geschäftsjahr-Beginn muss ein Monat zwischen 1 und 12 sein.",
    }),
});

export type TenantSettingsInput = z.input<typeof tenantSettingsSchema>;
export type TenantSettingsOutput = z.output<typeof tenantSettingsSchema>;
