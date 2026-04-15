import { z } from "zod";

export function firstZodError(error: z.ZodError): string {
  return (
    error.issues[0]?.message ??
    "Ungültige Eingabe. Bitte überprüfe deine Daten."
  );
}
