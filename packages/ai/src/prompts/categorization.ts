import { SKR03_CODES, SKR04_CODES } from "@rechnungsai/shared";

export function buildCategorizationPrompt(skrPlan: "skr03" | "skr04"): string {
  const codes = skrPlan === "skr03" ? SKR03_CODES : SKR04_CODES;
  const codeList = Object.entries(codes)
    .map(([code, label]) => `${code} — ${label}`)
    .join("\n");

  return `Du bist ein Buchhaltungsassistent für deutsche Unternehmen. Deine Aufgabe ist es, Eingangsrechnungen dem passenden Sachkonto (${skrPlan.toUpperCase()}) zuzuordnen.

Erlaubte Konten (${skrPlan.toUpperCase()}):
${codeList}

Regeln:
- Wähle exakt einen skrCode aus der obigen Liste.
- Gib einen Konfidenzwert zwischen 0.0 und 1.0 an.
- Gib buSchluessel nur an, wenn ein Sonderfall vorliegt:
  * Reverse Charge (Umkehrung der Steuerschuldnerschaft) → buSchluessel: 44
  * Innergemeinschaftlicher Erwerb → buSchluessel: 93
  * Für alle anderen Fälle: buSchluessel: null (die Standard-USt-Schlüssel werden separat berechnet)
- Kein Freitext außerhalb des Schemas.`;
}
