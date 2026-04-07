-- GENX Toolkit V2 Migration
-- Run this in Supabase SQL Editor

-- ─── lg_contacts ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lg_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  handle TEXT,
  status TEXT NOT NULL DEFAULT 'prospect',
  -- statuses: prospect, contacted, replied, interested, link_sent, signed_up, activated, lost
  va_user_id UUID,
  referral_link_used TEXT,
  source TEXT,
  first_contacted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  followup_count INTEGER DEFAULT 0,
  notes TEXT,
  last_message_sent TEXT,
  last_objection TEXT,
  tags TEXT[] DEFAULT '{}',
  is_starred BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_lg ON lg_contacts(lg_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_followup ON lg_contacts(next_followup_at) WHERE next_followup_at IS NOT NULL;

-- ─── lg_contact_activities ────────────────────────────────────
CREATE TABLE IF NOT EXISTS lg_contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES lg_contacts(id) ON DELETE CASCADE,
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  -- types: first_dm, follow_up, reply_received, objection, link_sent, signed_up, activated, lost, note, status_change
  note TEXT,
  script_used UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_contact ON lg_contact_activities(contact_id, created_at DESC);

-- ─── lg_referral_links ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lg_referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  label TEXT,
  link_code TEXT NOT NULL UNIQUE,
  full_url TEXT NOT NULL,
  click_count INTEGER DEFAULT 0,
  signup_count INTEGER DEFAULT 0,
  activated_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reflinks_lg ON lg_referral_links(lg_id);

-- ─── lg_custom_scripts: add times_replied (V2 addition) ──────
ALTER TABLE lg_custom_scripts ADD COLUMN IF NOT EXISTS times_replied INTEGER DEFAULT 0;

-- ─── genx_assets ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genx_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL DEFAULT 'pdf',
  file_url TEXT,
  file_name TEXT,
  category TEXT DEFAULT 'general',
  download_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
