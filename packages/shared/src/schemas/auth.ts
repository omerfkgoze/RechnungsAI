import { z } from "zod";

const emailField = z
  .string({ required_error: "E-Mail ist erforderlich." })
  .trim()
  .toLowerCase()
  .min(1, { message: "E-Mail ist erforderlich." })
  .max(254, { message: "E-Mail ist zu lang." })
  .email({ message: "Bitte gib eine gültige E-Mail ein." });

const passwordField = z
  .string({ required_error: "Passwort ist erforderlich." })
  .min(8, { message: "Passwort muss mindestens 8 Zeichen enthalten." })
  // bcrypt truncates silently at 72 bytes — enforce the boundary so users
  // don't set a long passphrase whose tail is effectively ignored.
  .max(72, { message: "Passwort darf höchstens 72 Zeichen enthalten." })
  .regex(/[0-9]/, { message: "Passwort muss eine Zahl enthalten." });

export const signupSchema = z
  .object({
    email: emailField,
    password: passwordField,
    passwordConfirm: z.string({
      required_error: "Bitte bestätige dein Passwort.",
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Die Passwörter stimmen nicht überein.",
  });

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string({ required_error: "Passwort ist erforderlich." })
    .min(1, { message: "Passwort ist erforderlich." }),
});

export const resetRequestSchema = z.object({
  email: emailField,
});

export const resetUpdateSchema = z
  .object({
    password: passwordField,
    passwordConfirm: z.string({
      required_error: "Bitte bestätige dein Passwort.",
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "Die Passwörter stimmen nicht überein.",
  });

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetRequestInput = z.infer<typeof resetRequestSchema>;
export type ResetUpdateInput = z.infer<typeof resetUpdateSchema>;
