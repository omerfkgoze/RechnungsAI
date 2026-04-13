import { z } from "zod";

export const SKR_PLANS = ["SKR03", "SKR04"] as const;
export type SkrPlan = (typeof SKR_PLANS)[number];

export const onboardingSetupSchema = z.object({
  company_name: z
    .string({ required_error: "Firmenname ist erforderlich." })
    .trim()
    .min(2, { message: "Firmenname ist zu kurz." })
    .max(100, { message: "Firmenname ist zu lang." }),
  skr_plan: z.enum(SKR_PLANS, {
    errorMap: () => ({ message: "Bitte wähle SKR03 oder SKR04." }),
  }),
  // Optional steuerberater — treat empty string as "not provided" so the
  // empty-from-empty-input case stays legal without forcing the client to
  // convert to undefined.
  steuerberater_name: z
    .string()
    .trim()
    .max(100, { message: "Name ist zu lang." })
    .optional()
    .or(z.literal("")),
});

export type OnboardingSetupInput = z.infer<typeof onboardingSetupSchema>;
