-- =============================================
-- Loss Reason Tracking
-- Track WHY prospects don't convert
-- =============================================

-- 1. Columns on admin_prospects
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS loss_reason TEXT;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS loss_reason_detail TEXT;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS lost_by TEXT;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS times_lost INTEGER DEFAULT 0;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS revisit_at TIMESTAMPTZ;

-- 2. Loss history table (for prospects that go lost multiple times)
CREATE TABLE IF NOT EXISTS admin_prospect_loss_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES admin_prospects(id) ON DELETE CASCADE,
  lost_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lost_by TEXT NOT NULL,
  loss_reason TEXT NOT NULL,
  loss_reason_detail TEXT,
  stage_before TEXT,
  days_in_pipeline INTEGER,
  channel TEXT,
  reactivated_at TIMESTAMPTZ,
  reactivated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_prospect_loss_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_loss_history_prospect ON admin_prospect_loss_history(prospect_id);
CREATE INDEX IF NOT EXISTS idx_loss_history_reason ON admin_prospect_loss_history(loss_reason);
CREATE INDEX IF NOT EXISTS idx_loss_history_date ON admin_prospect_loss_history(lost_at DESC);
