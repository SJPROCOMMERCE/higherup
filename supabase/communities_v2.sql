-- =============================================
-- Communities V2: VA Community Tracking
-- Communities = plekken waar VA's zitten
-- =============================================

-- New columns for VA community tracking
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS quality_rating INTEGER DEFAULT 0;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS admin_name TEXT;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS admin_handle TEXT;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS admin_contacted BOOLEAN DEFAULT false;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS we_are_member BOOLEAN DEFAULT false;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS joined_date DATE;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS posts_made INTEGER DEFAULT 0;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS last_posted_at TIMESTAMPTZ;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS vas_from_here INTEGER DEFAULT 0;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS total_products_from_here INTEGER DEFAULT 0;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS revenue_from_here NUMERIC(10,2) DEFAULT 0;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS lg_earnings_from_here NUMERIC(10,2) DEFAULT 0;
ALTER TABLE admin_communities ADD COLUMN IF NOT EXISTS active_lgs TEXT[] DEFAULT '{}';

-- Update status options: discovered, monitoring, active, paused, blacklisted
-- (no schema change needed, just different values)

-- Add onlinejobs as platform option (handled in frontend)
-- Add 'discovered' as default status for new communities
