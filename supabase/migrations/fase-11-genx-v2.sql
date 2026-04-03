-- ============================================================
-- FASE 11 V2: GENX — Additional tables and columns
-- ============================================================

-- Add columns to lead_generators
ALTER TABLE lead_generators
  ADD COLUMN IF NOT EXISTS weekly_target_signups INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS weekly_target_activations INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS monthly_target_active_vas INTEGER;

-- Add columns to referral_tracking
ALTER TABLE referral_tracking
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_flag TEXT,
  ADD COLUMN IF NOT EXISTS risk_reason TEXT,
  ADD COLUMN IF NOT EXISTS products_week INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_weekly_products NUMERIC(10,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weeks_active INTEGER DEFAULT 0;

-- Source-tracked referral links
CREATE TABLE IF NOT EXISTS referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  link_code TEXT NOT NULL UNIQUE,
  full_url TEXT NOT NULL,
  click_count INTEGER NOT NULL DEFAULT 0,
  signup_count INTEGER NOT NULL DEFAULT 0,
  active_count INTEGER NOT NULL DEFAULT 0,
  conversion_rate NUMERIC(5,1) DEFAULT 0,
  activation_rate NUMERIC(5,1) DEFAULT 0,
  avg_products_per_va NUMERIC(10,1) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reflinks_lg ON referral_links(lg_id);
CREATE INDEX IF NOT EXISTS idx_reflinks_code ON referral_links(link_code);

-- Outreach log (mini-CRM)
CREATE TABLE IF NOT EXISTS lg_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_channel TEXT NOT NULL,
  contact_handle TEXT,
  pipeline_status TEXT NOT NULL DEFAULT 'prospect',
  va_id UUID REFERENCES vas(id),
  last_contacted_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_lg ON lg_outreach(lg_id, pipeline_status);
CREATE INDEX IF NOT EXISTS idx_outreach_followup ON lg_outreach(lg_id, next_followup_at) WHERE next_followup_at IS NOT NULL;

-- Outreach activity log
CREATE TABLE IF NOT EXISTS lg_outreach_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outreach_id UUID NOT NULL REFERENCES lg_outreach(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outreach_act ON lg_outreach_activities(outreach_id, created_at DESC);

-- Action feed (intelligence)
CREATE TABLE IF NOT EXISTS lg_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  va_id UUID REFERENCES vas(id),
  outreach_id UUID REFERENCES lg_outreach(id),
  title TEXT NOT NULL,
  description TEXT,
  suggested_actions JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_actions_lg ON lg_actions(lg_id, status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_actions_expire ON lg_actions(expires_at) WHERE status = 'pending';

-- Toolkit resources
CREATE TABLE IF NOT EXISTS genx_toolkit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  subcategory TEXT,
  channel TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  description TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_toolkit_cat ON genx_toolkit(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_toolkit_channel ON genx_toolkit(channel);

-- Leaderboard
CREATE TABLE IF NOT EXISTS lg_leaderboard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  period_type TEXT NOT NULL,
  active_vas INTEGER NOT NULL DEFAULT 0,
  total_products INTEGER NOT NULL DEFAULT 0,
  earnings NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  new_signups INTEGER NOT NULL DEFAULT 0,
  rank_active_vas INTEGER,
  rank_earnings INTEGER,
  rank_signups INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lb_lg_period ON lg_leaderboard(lg_id, period, period_type);
CREATE INDEX IF NOT EXISTS idx_lb_period ON lg_leaderboard(period, period_type);

-- RLS (open pattern, consistent with rest of project)
ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_outreach_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE genx_toolkit ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_referral_links" ON referral_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lg_outreach" ON lg_outreach FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lg_outreach_activities" ON lg_outreach_activities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lg_actions" ON lg_actions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_genx_toolkit" ON genx_toolkit FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lg_leaderboard" ON lg_leaderboard FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE lg_actions;

-- Helper RPC for referral products increment
CREATE OR REPLACE FUNCTION increment_referral_products(va_id_input UUID, products_input INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE referral_tracking
  SET total_products_lifetime = total_products_lifetime + products_input
  WHERE va_id = va_id_input;
END;
$$ LANGUAGE plpgsql;
