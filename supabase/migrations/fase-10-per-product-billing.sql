-- ────────────────────────────────────────────────────────────────────────────
-- FASE 10: Per-product billing migration
-- $0.25 per product · first 10 per VA per calendar month FREE
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. va_usage — per-upload usage log ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS va_usage (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  va_id           UUID NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  upload_id       UUID REFERENCES uploads(id) ON DELETE SET NULL,
  billing_month   TEXT NOT NULL,          -- 'YYYY-MM'
  product_count   INTEGER NOT NULL DEFAULT 0,
  free_count      INTEGER NOT NULL DEFAULT 0,
  billable_count  INTEGER NOT NULL DEFAULT 0,
  total_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  source          TEXT DEFAULT 'upload',  -- 'upload' | 'manual' | 'adjustment'
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_va_usage_va_month  ON va_usage(va_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_va_usage_upload_id ON va_usage(upload_id);

ALTER TABLE va_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "va_usage_select" ON va_usage
  FOR SELECT USING (
    auth.uid() = va_id
    OR EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "va_usage_insert_service" ON va_usage
  FOR INSERT WITH CHECK (true);  -- service role inserts via API

-- ── 2. Extend billing_line_items with per-product columns ────────────────────

ALTER TABLE billing_line_items
  ADD COLUMN IF NOT EXISTS product_count   INTEGER,
  ADD COLUMN IF NOT EXISTS free_count      INTEGER,
  ADD COLUMN IF NOT EXISTS billable_count  INTEGER,
  ADD COLUMN IF NOT EXISTS upload_id       UUID REFERENCES uploads(id) ON DELETE SET NULL;

-- tier column becomes nullable (was NOT NULL with CHECK constraint) — drop old check if present
DO $$
BEGIN
  ALTER TABLE billing_line_items ALTER COLUMN tier DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ── 3. Extend billing with per-product summary columns ───────────────────────

ALTER TABLE billing
  ADD COLUMN IF NOT EXISTS total_products     INTEGER,
  ADD COLUMN IF NOT EXISTS free_products      INTEGER,
  ADD COLUMN IF NOT EXISTS billable_products  INTEGER;

-- ── 4. Enable realtime ────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE va_usage;
