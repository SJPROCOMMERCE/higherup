-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 7.2 — Counting views + excluded_from_billing
-- Run in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. excluded_from_billing columns on uploads
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS excluded_from_billing BOOLEAN DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS excluded_reason TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS excluded_by TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ;

-- 2. monthly_client_counts view
CREATE OR REPLACE VIEW monthly_client_counts AS
SELECT
  u.va_id,
  u.client_id,
  c.store_name,
  TO_CHAR(u.uploaded_at, 'YYYY-MM') AS month,
  COUNT(u.id) AS upload_count,
  COALESCE(SUM(u.product_row_count), 0) AS total_variants,
  COALESCE(SUM(u.unique_product_count), 0) AS total_products,
  COALESCE(SUM(u.image_row_count), 0) AS total_image_rows,
  MIN(u.uploaded_at) AS first_upload,
  MAX(u.uploaded_at) AS last_upload
FROM uploads u
JOIN clients c ON c.id = u.client_id
WHERE u.status = 'done'
  AND (u.excluded_from_billing IS NULL OR u.excluded_from_billing = false)
GROUP BY u.va_id, u.client_id, c.store_name, TO_CHAR(u.uploaded_at, 'YYYY-MM');

-- 3. monthly_va_totals view
CREATE OR REPLACE VIEW monthly_va_totals AS
SELECT
  mcc.va_id,
  mcc.month,
  COUNT(DISTINCT mcc.client_id) AS client_count,
  SUM(mcc.total_variants) AS total_variants,
  SUM(mcc.total_products) AS total_products,
  SUM(mcc.upload_count) AS total_uploads
FROM monthly_client_counts mcc
GROUP BY mcc.va_id, mcc.month;

-- 4. monthly_client_billing view (joins tiers)
CREATE OR REPLACE VIEW monthly_client_billing AS
SELECT
  mcc.*,
  pt.tier_name,
  pt.display_name AS tier_display,
  pt.amount AS tier_amount
FROM monthly_client_counts mcc
LEFT JOIN LATERAL (
  SELECT tier_name, display_name, amount
  FROM pricing_tiers
  WHERE is_active = true
    AND min_variants <= mcc.total_variants
    AND (max_variants IS NULL OR max_variants >= mcc.total_variants)
  ORDER BY sort_order
  LIMIT 1
) pt ON true;

-- 5. monthly_va_invoices view
CREATE OR REPLACE VIEW monthly_va_invoices AS
SELECT
  mcb.va_id,
  mcb.month,
  COUNT(DISTINCT mcb.client_id) AS client_count,
  SUM(mcb.total_variants) AS total_variants,
  SUM(mcb.tier_amount) AS total_amount,
  ARRAY_AGG(
    JSON_BUILD_OBJECT(
      'client_id', mcb.client_id,
      'store_name', mcb.store_name,
      'variants', mcb.total_variants,
      'tier', mcb.tier_name,
      'tier_display', mcb.tier_display,
      'amount', mcb.tier_amount
    )
  ) AS line_items
FROM monthly_client_billing mcb
GROUP BY mcb.va_id, mcb.month;

-- 6. RLS enable + policy for views (views inherit from underlying tables, but be explicit)
-- Ensure pricing_tiers has RLS (it should already from fase-7.1)
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
-- existing policies cover excluded columns
