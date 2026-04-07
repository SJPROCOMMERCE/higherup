-- =============================================
-- Funnel Analytics: Pipeline Conversion Tracking
-- =============================================

-- 1. Add stage timestamps to admin_prospects
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS identified_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS interested_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS pitch_sent_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS call_scheduled_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS call_done_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS signed_up_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS onboarding_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS active_lg_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS revisit_later_at TIMESTAMPTZ;

-- 2. Migrate existing stage data to new names
UPDATE admin_prospects SET stage = 'identified' WHERE stage = 'lead';
UPDATE admin_prospects SET stage = 'call_scheduled' WHERE stage = 'scheduled';
UPDATE admin_prospects SET stage = 'active_lg' WHERE stage = 'converted';

-- 3. Backfill timestamps (best effort)
UPDATE admin_prospects SET identified_at = created_at WHERE identified_at IS NULL;
UPDATE admin_prospects SET contacted_at = updated_at WHERE stage IN ('contacted','replied','interested','pitch_sent','call_scheduled','call_done','signed_up','onboarding','active_lg') AND contacted_at IS NULL;

-- 4. Update historical activity logs
UPDATE admin_prospect_activities SET old_stage = 'identified' WHERE old_stage = 'lead';
UPDATE admin_prospect_activities SET new_stage = 'identified' WHERE new_stage = 'lead';
UPDATE admin_prospect_activities SET old_stage = 'call_scheduled' WHERE old_stage = 'scheduled';
UPDATE admin_prospect_activities SET new_stage = 'call_scheduled' WHERE new_stage = 'scheduled';
UPDATE admin_prospect_activities SET old_stage = 'active_lg' WHERE old_stage = 'converted';
UPDATE admin_prospect_activities SET new_stage = 'active_lg' WHERE new_stage = 'converted';

-- 5. Create funnel snapshots table
CREATE TABLE IF NOT EXISTS admin_funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  stage TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(snapshot_date, stage)
);
ALTER TABLE admin_funnel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_funnel_snap_date ON admin_funnel_snapshots(snapshot_date);
