import { z } from "zod";

export const INVOICE_STATUSES = [
  "captured",
  "processing",
  "ready",
  "review",
  "exported",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "text/xml",
  "application/xml",
] as const;
export type InvoiceAcceptedMime = (typeof INVOICE_ACCEPTED_MIME)[number];

export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_JPEG_BYTES = 2 * 1024 * 1024;

export const invoiceUploadInputSchema = z.object({
  originalFilename: z
    .string()
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(1, { message: "Dateiname ist ungültig." })
        .max(255, { message: "Dateiname ist ungültig." }),
    ),
  fileType: z
    .string()
    .refine(
      (v): v is InvoiceAcceptedMime =>
        (INVOICE_ACCEPTED_MIME as readonly string[]).includes(v),
      {
        message:
          "Dieser Dateityp wird nicht unterstützt. Erlaubt: JPEG, PNG, PDF, XML.",
      },
    ),
  sizeBytes: z
    .number()
    .refine((n) => n > 0 && n <= MAX_INVOICE_FILE_BYTES, {
      message: "Die Datei ist zu groß (max. 10 MB).",
    }),
});

export type InvoiceUploadInput = z.infer<typeof invoiceUploadInputSchema>;
