-- Story 3.4: invoice approval columns + confidence-priority sort keys.
-- Approval lives directly on the invoice row until Story 4.2 introduces the
-- durable audit_logs table. The three approval_* columns are an interim
-- stash that 4.2 will backfill from when designing the immutable hash chain.
-- The two SMALLINT generated columns let the dashboard list use plain
-- .order() chains in PostgREST (no raw SQL needed) for confidence-based
-- ordering: review-queue first, then green → amber → red within the queue.

ALTER TABLE public.invoices
  ADD COLUMN approved_at TIMESTAMPTZ,
  ADD COLUMN approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN approval_method TEXT
    CHECK (
      approval_method IS NULL
      OR approval_method IN ('swipe', 'button', 'keyboard', 'undo_revert')
    );

-- Index supports dashboard list filtered by status/tenant ordered by recency
-- of approval (e.g., "recently approved" sub-views).
CREATE INDEX invoices_tenant_status_approved_at_idx
  ON public.invoices (tenant_id, status, approved_at DESC NULLS LAST);

-- Generated SMALLINT columns for composite confidence-priority ordering.
-- review_priority_key: review queue (0) ranks before ready (1); other
-- statuses sort after, so the dashboard "instant-approve momentum" UX
-- (UX-DR13) shows review first, ready second.
-- confidence_sort_key: thresholds match `confidenceLevel` in
-- packages/shared (≥0.95 green, ≥0.70 amber, else red, null=3).
-- Safe-cast guard mirrors migration 20260424100000 to handle non-numeric
-- extractor output without throwing.
ALTER TABLE public.invoices
  ADD COLUMN review_priority_key SMALLINT GENERATED ALWAYS AS (
    CASE status
      WHEN 'review'     THEN 0
      WHEN 'ready'      THEN 1
      WHEN 'processing' THEN 2
      WHEN 'captured'   THEN 3
      WHEN 'exported'   THEN 4
    END
  ) STORED,
  ADD COLUMN confidence_sort_key SMALLINT GENERATED ALWAYS AS (
    CASE
      WHEN invoice_data IS NULL THEN 3
      WHEN (invoice_data -> 'gross_total' ->> 'confidence') IS NULL THEN 3
      WHEN (invoice_data -> 'gross_total' ->> 'confidence') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        CASE
          WHEN (invoice_data -> 'gross_total' ->> 'confidence')::numeric >= 0.95 THEN 0
          WHEN (invoice_data -> 'gross_total' ->> 'confidence')::numeric >= 0.70 THEN 1
          ELSE 2
        END
      ELSE 3
    END
  ) STORED;

CREATE INDEX invoices_review_sort_idx
  ON public.invoices (tenant_id, review_priority_key, confidence_sort_key);

-- Postgres has no incremental "GRANT UPDATE ADD COLUMN"; replace the full
-- column-level UPDATE grant from 20260421000000_categorization_corrections.sql
-- with the extended set including the three approval columns. The two
-- generated SMALLINT columns are computed by Postgres and cannot be granted
-- (Postgres rejects column-level grants on generated columns), so they are
-- not listed here.
GRANT UPDATE (
  status,
  updated_at,
  invoice_data,
  extracted_at,
  extraction_error,
  extraction_attempts,
  skr_code,
  bu_schluessel,
  categorization_confidence,
  approved_at,
  approved_by,
  approval_method
) ON public.invoices TO authenticated;
