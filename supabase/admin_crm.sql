-- ============================================================
-- ADMIN CRM — Volledig Recruitment + LG Management Systeem
-- Run in Supabase SQL Editor BEFORE deploying the code
-- ============================================================

-- 1. PROSPECTS — recruitment pipeline
CREATE TABLE IF NOT EXISTS admin_prospects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  platform        TEXT,                -- whatsapp, instagram, facebook, linkedin, telegram, tiktok, other
  handle          TEXT,                -- social media handle / username
  source          TEXT DEFAULT 'manual', -- manual, referral, community, inbound, event
  community_id    UUID,                -- FK to admin_communities
  stage           TEXT NOT NULL DEFAULT 'lead',  -- lead, contacted, interested, scheduled, converted, lost
  stage_index     SMALLINT DEFAULT 0,  -- position within kanban column
  priority        TEXT DEFAULT 'normal', -- low, normal, high, urgent
  follow_up_date  DATE,
  lost_reason     TEXT,
  converted_lg_id UUID,                -- FK to lead_generators if converted
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  converted_at    TIMESTAMPTZ
);

-- 2. PROSPECT ACTIVITIES — timeline per prospect
CREATE TABLE IF NOT EXISTS admin_prospect_activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES admin_prospects(id) ON DELETE CASCADE,
  activity_type   TEXT NOT NULL,       -- call, dm, email, meeting, note, status_change, follow_up
  description     TEXT,
  old_stage       TEXT,
  new_stage       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. COMMUNITIES — community mapping
CREATE TABLE IF NOT EXISTS admin_communities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  platform        TEXT NOT NULL,       -- facebook, whatsapp, telegram, linkedin, discord, other
  url             TEXT,
  description     TEXT,
  member_count    INTEGER DEFAULT 0,
  prospect_count  INTEGER DEFAULT 0,
  lg_count        INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'active', -- active, inactive, blacklisted
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Add FK from prospects to communities (after both tables exist)
ALTER TABLE admin_prospects
  ADD CONSTRAINT fk_prospect_community
  FOREIGN KEY (community_id) REFERENCES admin_communities(id) ON DELETE SET NULL;

-- 4. LG CHECKLIST — onboarding steps per LG
CREATE TABLE IF NOT EXISTS admin_lg_checklist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id           UUID NOT NULL,
  step_key        TEXT NOT NULL,       -- profile_complete, first_script_copied, first_outreach, first_referral, first_earning, toolkit_explored, community_joined
  step_label      TEXT NOT NULL,
  completed       BOOLEAN DEFAULT false,
  completed_at    TIMESTAMPTZ,
  sort_order      SMALLINT DEFAULT 0,
  UNIQUE(lg_id, step_key)
);

-- 5. LG NOTES — admin notes about LGs
CREATE TABLE IF NOT EXISTS admin_lg_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id           UUID NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 6. LG TIMELINE — auto-logged events for LGs
CREATE TABLE IF NOT EXISTS admin_lg_timeline (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id           UUID NOT NULL,
  event_type      TEXT NOT NULL,       -- approved, paused, deactivated, reactivated, first_referral, payout, milestone, note, checklist_complete
  description     TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 7. DAILY SCORECARD — admin's own daily tracking
CREATE TABLE IF NOT EXISTS admin_daily_scorecard (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  score_date      DATE NOT NULL UNIQUE,
  calls_made      INTEGER DEFAULT 0,
  dms_sent        INTEGER DEFAULT 0,
  emails_sent     INTEGER DEFAULT 0,
  prospects_added INTEGER DEFAULT 0,
  follow_ups_done INTEGER DEFAULT 0,
  appointments_set INTEGER DEFAULT 0,
  conversions     INTEGER DEFAULT 0,
  communities_posted INTEGER DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 8. ALTER lead_generators — add admin CRM columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_generators' AND column_name='onboarding_status') THEN
    ALTER TABLE lead_generators ADD COLUMN onboarding_status TEXT DEFAULT 'not_started';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_generators' AND column_name='lg_tier') THEN
    ALTER TABLE lead_generators ADD COLUMN lg_tier TEXT DEFAULT 'bronze';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_generators' AND column_name='community_id') THEN
    ALTER TABLE lead_generators ADD COLUMN community_id UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_generators' AND column_name='recruiter_notes') THEN
    ALTER TABLE lead_generators ADD COLUMN recruiter_notes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_generators' AND column_name='last_active_at') THEN
    ALTER TABLE lead_generators ADD COLUMN last_active_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lead_generators' AND column_name='conversion_source') THEN
    ALTER TABLE lead_generators ADD COLUMN conversion_source TEXT;
  END IF;
END $$;

-- RLS — enable on all new tables (no policies = service role only)
ALTER TABLE admin_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_prospect_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_lg_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_lg_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_lg_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_daily_scorecard ENABLE ROW LEVEL SECURITY;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON admin_prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_community ON admin_prospects(community_id);
CREATE INDEX IF NOT EXISTS idx_prospects_follow_up ON admin_prospects(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospect_activities_prospect ON admin_prospect_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_lg_checklist_lg ON admin_lg_checklist(lg_id);
CREATE INDEX IF NOT EXISTS idx_lg_notes_lg ON admin_lg_notes(lg_id);
CREATE INDEX IF NOT EXISTS idx_lg_timeline_lg ON admin_lg_timeline(lg_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_date ON admin_daily_scorecard(score_date);

-- Helper: seed default checklist when a new LG is approved
CREATE OR REPLACE FUNCTION seed_lg_checklist(p_lg_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO admin_lg_checklist (lg_id, step_key, step_label, sort_order) VALUES
    (p_lg_id, 'profile_complete',     'Profile volledig ingevuld',       1),
    (p_lg_id, 'toolkit_explored',     'Toolkit bekeken',                 2),
    (p_lg_id, 'first_script_copied',  'Eerste script gekopieerd',        3),
    (p_lg_id, 'first_outreach',       'Eerste outreach verstuurd',       4),
    (p_lg_id, 'first_referral',       'Eerste referral binnen',          5),
    (p_lg_id, 'first_earning',        'Eerste earning verdiend',         6),
    (p_lg_id, 'community_joined',     'Community gejoined',              7)
  ON CONFLICT (lg_id, step_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Unified activity view for the admin dashboard feed
CREATE OR REPLACE VIEW admin_activity_feed AS
  SELECT
    id, 'prospect_created' AS event_type,
    name AS title,
    'New prospect: ' || name AS description,
    NULL::UUID AS lg_id, id AS prospect_id,
    created_at
  FROM admin_prospects
  UNION ALL
  SELECT
    pa.id,
    'prospect_' || pa.activity_type AS event_type,
    ap.name AS title,
    COALESCE(pa.description, pa.activity_type) AS description,
    NULL::UUID AS lg_id, pa.prospect_id,
    pa.created_at
  FROM admin_prospect_activities pa
  JOIN admin_prospects ap ON ap.id = pa.prospect_id
  UNION ALL
  SELECT
    id, event_type,
    description AS title,
    description,
    lg_id, NULL::UUID AS prospect_id,
    created_at
  FROM admin_lg_timeline
  ORDER BY created_at DESC;
