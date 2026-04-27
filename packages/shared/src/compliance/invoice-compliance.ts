import type { Invoice } from "../schemas/invoice.js";

export type ComplianceCode =
  | "missing_ust_id"
  | "invalid_invoice_date"
  | "missing_invoice_number"
  | "missing_supplier_name"
  | "missing_gross_total"
  | "vat_total_mismatch";

export type ComplianceSeverity = "amber" | "red";

export type ComplianceWarning = {
  id: ComplianceCode;
  severity: ComplianceSeverity;
  field: string;
  code: ComplianceCode;
  message: string;
};

const VAT_MISMATCH_TOLERANCE_EUR = 0.02;

const DE_UST_ID_RE = /^DE\d{9}$/;

function checkUstId(invoice: Invoice): ComplianceWarning | null {
  const val = invoice.supplier_tax_id?.value;
  if (val === null || val === undefined || val === "" || !DE_UST_ID_RE.test(val)) {
    return {
      id: "missing_ust_id",
      severity: "amber",
      field: "supplier_tax_id",
      code: "missing_ust_id",
      message: "Die USt-IdNr fehlt auf dieser Rechnung. Bitte ergänzen oder den Lieferanten kontaktieren.",
    };
  }
  return null;
}

function checkInvoiceDate(invoice: Invoice): ComplianceWarning | null {
  const val = invoice.invoice_date?.value;
  if (val === null || val === undefined) {
    return {
      id: "invalid_invoice_date",
      severity: "amber",
      field: "invoice_date",
      code: "invalid_invoice_date",
      message: "Das Rechnungsdatum fehlt oder ist ungültig. Bitte trage das korrekte Datum ein.",
    };
  }
  const date = new Date(val + "T00:00:00Z");
  const now = new Date();
  const nowUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dateMs = date.getTime();
  const cutoff = new Date();
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 18);
  const eighteenMonthsAgoMs = Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), cutoff.getUTCDate());
  const oneDayAheadMs = nowUtcMs + 24 * 60 * 60 * 1000;
  if (dateMs < eighteenMonthsAgoMs || dateMs > oneDayAheadMs) {
    return {
      id: "invalid_invoice_date",
      severity: "amber",
      field: "invoice_date",
      code: "invalid_invoice_date",
      message: "Das Rechnungsdatum fehlt oder ist ungültig. Bitte trage das korrekte Datum ein.",
    };
  }
  return null;
}

function checkInvoiceNumber(invoice: Invoice): ComplianceWarning | null {
  const val = invoice.invoice_number?.value;
  if (val === null || val === undefined || val === "") {
    return {
      id: "missing_invoice_number",
      severity: "amber",
      field: "invoice_number",
      code: "missing_invoice_number",
      message: "Die Rechnungsnummer fehlt. Bitte ergänze sie aus dem Originalbeleg.",
    };
  }
  return null;
}

function checkSupplierName(invoice: Invoice): ComplianceWarning | null {
  const val = invoice.supplier_name?.value;
  if (val === null || val === undefined || val === "") {
    return {
      id: "missing_supplier_name",
      severity: "amber",
      field: "supplier_name",
      code: "missing_supplier_name",
      message: "Der Lieferantenname fehlt. Ohne Lieferant kann die Rechnung nicht exportiert werden.",
    };
  }
  return null;
}

function checkGrossTotal(invoice: Invoice): ComplianceWarning | null {
  const val = invoice.gross_total?.value;
  if (val === null || val === undefined || val === 0) {
    return {
      id: "missing_gross_total",
      severity: "amber",
      field: "gross_total",
      code: "missing_gross_total",
      message: "Der Bruttobetrag fehlt. Bitte trage den Gesamtbetrag der Rechnung ein.",
    };
  }
  return null;
}

function checkVatMismatch(invoice: Invoice): ComplianceWarning | null {
  const net = invoice.net_total?.value;
  const vat = invoice.vat_total?.value;
  const gross = invoice.gross_total?.value;
  if (net === null || net === undefined) return null;
  if (vat === null || vat === undefined) return null;
  if (gross === null || gross === undefined) return null;
  const currency = invoice.currency?.value;
  if (currency !== null && currency !== undefined && currency !== "EUR") return null;
  if (Math.abs(net + vat - gross) > VAT_MISMATCH_TOLERANCE_EUR) {
    return {
      id: "vat_total_mismatch",
      severity: "amber",
      field: "gross_total",
      code: "vat_total_mismatch",
      message: "Netto + MwSt. ergeben nicht den Bruttobetrag. Bitte überprüfe die Beträge.",
    };
  }
  return null;
}

export function runComplianceChecks(invoice: Invoice): ComplianceWarning[] {
  const checks = [
    checkUstId,
    checkInvoiceDate,
    checkInvoiceNumber,
    checkSupplierName,
    checkGrossTotal,
    checkVatMismatch,
  ];
  const warnings: ComplianceWarning[] = [];
  for (const check of checks) {
    const w = check(invoice);
    if (w !== null) warnings.push(w);
  }
  return warnings;
}
