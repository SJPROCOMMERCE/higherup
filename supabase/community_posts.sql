-- =============================================
-- Community Posts — Track outreach posts in VA communities
-- =============================================

CREATE TABLE IF NOT EXISTS admin_community_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES admin_communities(id) ON DELETE CASCADE,
  script_id UUID REFERENCES admin_outreach_scripts(id),
  title TEXT,
  content TEXT NOT NULL,
  posted_by TEXT,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform TEXT,
  dms_received INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  prospects_generated INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_community_posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_community_posts_community ON admin_community_posts(community_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_script ON admin_community_posts(script_id);
