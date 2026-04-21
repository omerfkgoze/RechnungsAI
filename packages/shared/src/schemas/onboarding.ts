import { z } from "zod";
import { normalizeName } from "./_normalize.js";

export const SKR_PLANS = ["SKR03", "SKR04"] as const;
export type SkrPlan = (typeof SKR_PLANS)[number];

export const onboardingSetupSchema = z.object({
  disclaimer_accepted: z.literal(true, {
    error: () =>
      "Bitte bestätige zuerst den Hinweis zur KI-Nutzung auf der vorherigen Seite.",
  }),
  company_name: z
    .string()
    .transform(normalizeName)
    .pipe(
      z
        .string()
        .min(2, { message: "Firmenname ist zu kurz." })
        .max(100, { message: "Firmenname ist zu lang." }),
    ),
  skr_plan: z.enum(SKR_PLANS, {
    error: () => "Bitte wähle SKR03 oder SKR04.",
  }),
  steuerberater_name: z
    .string()
    .transform((v) => {
      const cleaned = normalizeName(v);
      return cleaned.length === 0 ? null : cleaned;
    })
    .pipe(
      z
        .string()
        .max(100, { message: "Name ist zu lang." })
        .nullable(),
    ),
});

export type OnboardingSetupInput = z.input<typeof onboardingSetupSchema>;
export type OnboardingSetupOutput = z.output<typeof onboardingSetupSchema>;
