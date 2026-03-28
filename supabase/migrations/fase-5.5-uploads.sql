-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 5.5 — Uploads table: complete & watertight
-- Run in: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add missing columns ───────────────────────────────────────────────────

-- File info
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_filename   TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS file_size_bytes     INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sheet_name          TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS detected_as_shopify BOOLEAN DEFAULT false;

-- Product counting
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS unique_product_count INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS image_row_count      INTEGER;

-- Column mapping
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS column_mapping JSONB;

-- Image SEO settings
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS image_settings JSONB;

-- Special instructions handling
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS pre_check_result     JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS adjusted_instruction TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_columns       JSONB;

-- Price rules
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS price_rules JSONB;

-- API cost tracking
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_input_tokens  INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_output_tokens INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_cached_tokens INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_cost_usd      DECIMAL;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_calls_count   INTEGER;

-- Processing details
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_total       INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_completed   INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_failed      INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS products_optimized  INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS products_failed     INTEGER;

-- Download tracking
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_downloaded    BOOLEAN   DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_downloaded_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS download_count       INTEGER   DEFAULT 0;

-- Admin interaction (on_hold)
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS held_reason  TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS released_by  TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS released_at  TIMESTAMPTZ;

-- Retry tracking
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS retry_count            INTEGER DEFAULT 0;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS retried_from_upload_id UUID REFERENCES uploads(id);
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_upload_id     UUID REFERENCES uploads(id);

-- Timestamps
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_started_at   TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ DEFAULT now();

-- ─── 2. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_uploads_va_id      ON uploads(va_id);
CREATE INDEX IF NOT EXISTS idx_uploads_client_id  ON uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status     ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_uploads_va_status  ON uploads(va_id, status);
CREATE INDEX IF NOT EXISTS idx_uploads_client_month ON uploads(client_id, uploaded_at)
  WHERE status = 'done';
CREATE INDEX IF NOT EXISTS idx_uploads_va_day ON uploads(va_id, uploaded_at)
  WHERE status != 'failed';

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on uploads" ON uploads;
CREATE POLICY "Allow all on uploads" ON uploads FOR ALL USING (true) WITH CHECK (true);

-- ─── 4. Auto-update updated_at trigger ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS uploads_updated_at ON uploads;
CREATE TRIGGER uploads_updated_at
  BEFORE UPDATE ON uploads
  FOR EACH ROW
  EXECUTE FUNCTION update_uploads_updated_at();

-- ─── 5. Download tracking function ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION track_download(upload_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE uploads SET
    output_downloaded    = true,
    output_downloaded_at = COALESCE(output_downloaded_at, now()),
    download_count       = COALESCE(download_count, 0) + 1
  WHERE id = upload_uuid;
END;
$$ LANGUAGE plpgsql;

-- ─── 6. Daily variant rate-limit query (reference) ───────────────────────────
-- SELECT COALESCE(SUM(product_row_count), 0) AS today_variants
-- FROM uploads
-- WHERE va_id    = '[va_id]'
--   AND uploaded_at >= CURRENT_DATE
--   AND status != 'failed';
