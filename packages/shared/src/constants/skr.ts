import { z } from "zod";

export const SKR03_CODES: Record<string, string> = {
  "0400": "EDV-Anlagen",
  "0650": "Geringwertige Wirtschaftsgüter",
  "0800": "Maschinen",
  "1200": "Bank",
  "1210": "Kasse",
  "3400": "Wareneingang 19% VSt",
  "3420": "Wareneingang 7% VSt",
  "3500": "Bezogene Leistungen 19% VSt",
  "3520": "Bezogene Leistungen 7% VSt",
  "4230": "Bürobedarf",
  "4240": "Zeitschriften, Bücher",
  "4260": "Miete",
  "4360": "Kfz-Kosten",
  "4530": "Werbekosten",
  "4600": "Reise-/Übernachtungskosten",
  "4650": "Bewirtungskosten",
  "4800": "Personalkosten",
  "4830": "Gehälter",
  "4940": "Sonstige Betriebsausgaben",
};

export const SKR04_CODES: Record<string, string> = {
  "0300": "Maschinen",
  "0650": "Geringwertige Wirtschaftsgüter",
  "1200": "Bank",
  "1600": "Verbindlichkeiten aus LuL",
  "3200": "Handelsware",
  "4300": "Umsatzerlöse 7% USt",
  "4400": "Umsatzerlöse 19% USt",
  "6000": "Materialaufwand",
  "6200": "Bezogene Leistungen",
  "6310": "Bürobedarf",
  "6340": "Zeitschriften, Bücher",
  "6520": "Miete",
  "6570": "Kfz-Kosten",
  "6600": "Werbeaufwand",
  "6660": "Reise-/Übernachtungskosten",
  "6670": "Bewirtungsaufwand",
  "7000": "Personalaufwand",
  "7100": "Gehälter",
};

export const BU_SCHLUESSEL_LABELS: Record<number, string> = {
  0: "Steuerfrei",
  8: "7% VSt",
  9: "19% VSt",
  44: "Reverse Charge",
  93: "Innergemeinschaftlicher Erwerb",
};

export function mapBuSchluessel(vatRate: number | null): number {
  if (vatRate === null) return 0;
  // Reject NaN, Infinity, and negative rates — silent "Steuerfrei" classification
  // for garbage input would corrupt UStVA reporting.
  if (!Number.isFinite(vatRate) || vatRate < 0) return 0;
  if (Math.abs(vatRate - 0.19) <= 0.005) return 9;
  if (Math.abs(vatRate - 0.07) <= 0.005) return 8;
  return 0;
}

export const categorizationOutputSchema = z.object({
  skrCode: z.string(),
  confidence: z.number().min(0).max(1),
  buSchluessel: z.number().nullable(),
});
