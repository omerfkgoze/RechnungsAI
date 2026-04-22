-- Generated columns for sort/filter on JSONB fields.
-- PostgREST (.order() / .gte() / .lte()) only accepts plain column names;
-- it cannot parse arbitrary SQL expressions like (invoice_data->>'x')::numeric.
-- These STORED generated columns let Supabase-js use simple column references.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS gross_total_value NUMERIC
    GENERATED ALWAYS AS (
      (invoice_data -> 'gross_total' ->> 'value')::NUMERIC
    ) STORED,
  ADD COLUMN IF NOT EXISTS supplier_name_value TEXT
    GENERATED ALWAYS AS (
      invoice_data -> 'supplier_name' ->> 'value'
    ) STORED;

-- Indexes so ORDER BY and range filters on these columns stay fast.
CREATE INDEX IF NOT EXISTS invoices_gross_total_value_idx
  ON public.invoices (tenant_id, gross_total_value DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS invoices_supplier_name_value_idx
  ON public.invoices (tenant_id, supplier_name_value NULLS LAST);
