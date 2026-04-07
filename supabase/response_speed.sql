-- =============================================
-- Response Speed Tracking
-- Track how fast we respond to prospect replies
-- =============================================

-- 1. Columns on admin_prospects
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS our_response_at TIMESTAMPTZ;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS has_unreplied BOOLEAN DEFAULT false;
ALTER TABLE admin_prospects ADD COLUMN IF NOT EXISTS last_response_time_minutes INTEGER;

-- 2. Columns on admin_prospect_activities
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS sender TEXT;
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS channel_used TEXT;
ALTER TABLE admin_prospect_activities ADD COLUMN IF NOT EXISTS response_time_minutes INTEGER;

-- 3. Response speed log table
CREATE TABLE IF NOT EXISTS admin_response_speed_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES admin_prospects(id) ON DELETE CASCADE,
  reply_activity_id UUID REFERENCES admin_prospect_activities(id),
  reply_at TIMESTAMPTZ NOT NULL,
  reply_channel TEXT,
  response_activity_id UUID REFERENCES admin_prospect_activities(id),
  response_at TIMESTAMPTZ,
  response_by TEXT,
  response_time_minutes INTEGER,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_response_speed_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_rsl_prospect ON admin_response_speed_log(prospect_id);
CREATE INDEX IF NOT EXISTS idx_rsl_waiting ON admin_response_speed_log(status) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_rsl_time ON admin_response_speed_log(response_time_minutes) WHERE response_time_minutes IS NOT NULL;
