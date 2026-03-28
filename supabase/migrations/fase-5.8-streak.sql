-- ─── Fase 5.8 — Streak Multiplier System ─────────────────────────────────────

-- Add streak tracking columns to referral_codes
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS payment_streak              INTEGER        DEFAULT 0;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS current_percentage          DECIMAL(5,2)   DEFAULT 20;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS highest_streak              INTEGER        DEFAULT 0;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS streak_lost_count           INTEGER        DEFAULT 0;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS next_tier_at                INTEGER        DEFAULT 3;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS potential_monthly_earnings  DECIMAL(10,2)  DEFAULT 0;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS actual_monthly_earnings     DECIMAL(10,2)  DEFAULT 0;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS last_streak_reset_month     TEXT;
ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS streak_last_updated_month   TEXT;

-- ─── get_referral_percentage ──────────────────────────────────────────────────
-- Returns the payout percentage for a given payment streak count.
-- Called from application layer (mirrors TypeScript getPercentageForStreak).

CREATE OR REPLACE FUNCTION get_referral_percentage(streak INTEGER)
RETURNS DECIMAL AS $$
BEGIN
  IF    streak >= 12 THEN RETURN 35;
  ELSIF streak >= 10 THEN RETURN 30;
  ELSIF streak >= 7  THEN RETURN 28;
  ELSIF streak >= 5  THEN RETURN 25;
  ELSIF streak >= 3  THEN RETURN 23;
  ELSE                    RETURN 20;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
-- referral_codes already has open policies from fase-5.7.
-- No new tables, so no new RLS needed.
