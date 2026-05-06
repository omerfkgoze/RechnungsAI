export type DatevTenantConfig = {
  beraterNr: string;
  mandantenNr: string;
  sachkontenlaenge: number;
  fiscalYearStart: number;
  skrPlan: "SKR03" | "SKR04";
  defaultKreditorenkonto: string | null;
};

export type DatevBookingRow = {
  gross_total: number;
  invoice_date: string;
  invoice_number: string | null;
  supplier: string | null;
  skr_code: string | null;
  bu_schluessel: number | null;
};

export type DatevExportResult = {
  csv: string;
  rowCount: number;
  skippedCount: number;
  dateFrom: string;
  dateTo: string;
};
