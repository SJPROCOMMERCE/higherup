-- ─── Phase 7.1 Pricing Tiers: Dynamic Pricing System ─────────────────────────

-- 1. Main pricing tiers table
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name    TEXT        NOT NULL UNIQUE,
  display_name TEXT        NOT NULL,
  min_variants INTEGER     NOT NULL,
  max_variants INTEGER,                    -- NULL = unlimited
  amount       DECIMAL     NOT NULL,
  currency     TEXT        DEFAULT 'USD',
  description  TEXT,
  is_active    BOOLEAN     DEFAULT true,
  sort_order   INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_active ON pricing_tiers(is_active, sort_order);

ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on pricing_tiers" ON pricing_tiers FOR ALL USING (true) WITH CHECK (true);

-- 2. Pricing change history for auditing
CREATE TABLE IF NOT EXISTS pricing_tier_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id      UUID        NOT NULL REFERENCES pricing_tiers(id),
  tier_name    TEXT        NOT NULL,
  old_amount   DECIMAL     NOT NULL,
  new_amount   DECIMAL     NOT NULL,
  old_min      INTEGER,
  old_max      INTEGER,
  new_min      INTEGER,
  new_max      INTEGER,
  changed_by   TEXT        NOT NULL,
  change_reason TEXT,
  effective_from TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_history_tier ON pricing_tier_history(tier_id);

ALTER TABLE pricing_tier_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on pricing_tier_history" ON pricing_tier_history FOR ALL USING (true) WITH CHECK (true);

-- 3. Seed default tiers (idempotent)
INSERT INTO pricing_tiers (tier_name, display_name, min_variants, max_variants, amount, description, sort_order)
VALUES
  ('tier_1', 'Starter',      0,    200,  50,  'Perfect for small stores with up to 200 variants per month',      1),
  ('tier_2', 'Growth',       201,  400,  110, 'For growing stores processing up to 400 variants per month',      2),
  ('tier_3', 'Professional', 401,  1000, 220, 'For established stores with high volume',                         3),
  ('tier_4', 'Enterprise',   1001, NULL, 350, 'Unlimited variants for large-scale operations',                   4)
ON CONFLICT (tier_name) DO NOTHING;

-- 4. Dynamic get_tier function
CREATE OR REPLACE FUNCTION get_tier(variant_count INTEGER)
RETURNS TABLE(tier_name TEXT, display_name TEXT, amount DECIMAL) AS $$
BEGIN
  RETURN QUERY
  SELECT pt.tier_name, pt.display_name, pt.amount
  FROM   pricing_tiers pt
  WHERE  pt.is_active = true
    AND  pt.min_variants <= variant_count
    AND  (pt.max_variants IS NULL OR pt.max_variants >= variant_count)
  ORDER  BY pt.sort_order
  LIMIT  1;
END;
$$ LANGUAGE plpgsql;
