-- Story 3.2 / P14: Recreate gross_total_value + supplier_name_value with safe casts.
-- The original cast (...)::NUMERIC fails if invoice_data contains a German-locale
-- string like "1.234,56". The safe CASE WHEN guard yields NULL instead of erroring.

-- Drop the dependent indexes first (CASCADE removes them with the columns).
DROP INDEX IF EXISTS public.invoices_gross_total_value_idx;
DROP INDEX IF EXISTS public.invoices_supplier_name_value_idx;

-- Drop old columns (CASCADE needed because stored generated columns cannot be altered).
ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS gross_total_value CASCADE,
  DROP COLUMN IF EXISTS supplier_name_value CASCADE;

-- Recreate with safe cast.
ALTER TABLE public.invoices
  ADD COLUMN gross_total_value NUMERIC
    GENERATED ALWAYS AS (
      CASE
        WHEN invoice_data -> 'gross_total' ->> 'value' ~ '^-?[0-9]+(\.[0-9]+)?$'
        THEN (invoice_data -> 'gross_total' ->> 'value')::NUMERIC
        ELSE NULL
      END
    ) STORED,
  ADD COLUMN supplier_name_value TEXT
    GENERATED ALWAYS AS (
      invoice_data -> 'supplier_name' ->> 'value'
    ) STORED;

-- Recreate the indexes from Story 3.1.
CREATE INDEX invoices_gross_total_value_idx
  ON public.invoices (tenant_id, gross_total_value DESC NULLS LAST);

CREATE INDEX invoices_supplier_name_value_idx
  ON public.invoices (tenant_id, supplier_name_value NULLS LAST);
