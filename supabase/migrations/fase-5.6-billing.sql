-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 5.6 — Billing table: complete & watertight
-- Run in: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Extend billing table ──────────────────────────────────────────────────

ALTER TABLE billing ADD COLUMN IF NOT EXISTS invoice_number          TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS va_name                  TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS va_email                 TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS va_payment_method        TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS va_payment_details       JSONB;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS total_variants           INTEGER DEFAULT 0;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS total_clients            INTEGER DEFAULT 0;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS currency                 TEXT    DEFAULT 'USD';
ALTER TABLE billing ADD COLUMN IF NOT EXISTS wise_transfer_id         TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS payment_method_used      TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS payment_reference        TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS payment_amount_received  DECIMAL;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS reminded_at              TIMESTAMPTZ;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS paused_at                TIMESTAMPTZ;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS blocked_at               TIMESTAMPTZ;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS notes                    TEXT;
ALTER TABLE billing ADD COLUMN IF NOT EXISTS created_by               TEXT DEFAULT 'system';
ALTER TABLE billing ADD COLUMN IF NOT EXISTS updated_at               TIMESTAMPTZ DEFAULT now();

-- Add 'waived' to status if it doesn't already exist in the check constraint
-- (comment out if DB doesn't use a check constraint)
-- ALTER TABLE billing DROP CONSTRAINT IF EXISTS billing_status_check;
-- ALTER TABLE billing ADD CONSTRAINT billing_status_check
--   CHECK (status IN ('outstanding', 'paid', 'overdue', 'waived'));

-- ─── 2. Indexes on billing ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_billing_va_id    ON billing(va_id);
CREATE INDEX IF NOT EXISTS idx_billing_month    ON billing(month);
CREATE INDEX IF NOT EXISTS idx_billing_status   ON billing(status);
CREATE INDEX IF NOT EXISTS idx_billing_va_month ON billing(va_id, month);
CREATE INDEX IF NOT EXISTS idx_billing_due_date ON billing(due_date) WHERE status != 'paid';

-- ─── 3. RLS on billing ────────────────────────────────────────────────────────

ALTER TABLE billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on billing" ON billing;
CREATE POLICY "Allow all on billing" ON billing FOR ALL USING (true) WITH CHECK (true);

-- ─── 4. billing_line_items table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_line_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id           UUID NOT NULL REFERENCES billing(id) ON DELETE CASCADE,
  client_id            UUID NOT NULL REFERENCES clients(id),
  store_name           TEXT NOT NULL,
  niche                TEXT,
  variant_count        INTEGER NOT NULL,
  unique_product_count INTEGER,
  tier                 TEXT NOT NULL CHECK (tier IN ('tier_1', 'tier_2', 'tier_3', 'tier_4')),
  amount               DECIMAL NOT NULL,
  upload_count         INTEGER DEFAULT 0,
  first_upload_at      TIMESTAMPTZ,
  last_upload_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_line_items_billing_id ON billing_line_items(billing_id);
CREATE INDEX IF NOT EXISTS idx_billing_line_items_client_id  ON billing_line_items(client_id);

ALTER TABLE billing_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on billing_line_items" ON billing_line_items;
CREATE POLICY "Allow all on billing_line_items" ON billing_line_items FOR ALL USING (true) WITH CHECK (true);

-- ─── 5. Generic updated_at trigger function ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS billing_updated_at ON billing;
CREATE TRIGGER billing_updated_at
  BEFORE UPDATE ON billing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ─── 6. Invoice number generator ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_invoice_number(invoice_month TEXT)
RETURNS TEXT AS $$
DECLARE
  seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(invoice_number, '-', 4) AS INTEGER)
  ), 0) + 1 INTO seq
  FROM billing
  WHERE month = invoice_month
    AND invoice_number IS NOT NULL
    AND invoice_number LIKE 'INV-%';

  RETURN 'INV-' || invoice_month || '-' || LPAD(seq::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;
