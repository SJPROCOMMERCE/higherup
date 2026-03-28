-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 5.7 — Affiliate system rewrite (percentage-based)
-- Run in: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Affiliates table: drop old columns, add new ones ─────────────────────

ALTER TABLE affiliates DROP COLUMN IF EXISTS payout_per_month;
ALTER TABLE affiliates DROP COLUMN IF EXISTS current_month_payout;

ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS referral_code                 TEXT;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS referred_va_name              TEXT;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS referred_va_country           TEXT;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS referred_va_status            TEXT DEFAULT 'pending_approval';
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS referred_va_onboarded         BOOLEAN DEFAULT false;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS referred_va_first_upload_at   TIMESTAMPTZ;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS referred_va_joined_month      TEXT;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS free_month_used               BOOLEAN DEFAULT false;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS months_active                 INTEGER DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS months_paid                   INTEGER DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS total_referred_va_paid        DECIMAL DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS total_payout_earned           DECIMAL DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS last_payout_at                TIMESTAMPTZ;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS current_month_referred_fee    DECIMAL DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS current_month_payout_amount   DECIMAL DEFAULT 0;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS current_month_referred_paid   BOOLEAN DEFAULT false;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS payout_percentage             DECIMAL DEFAULT 20;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS notes                         TEXT;
ALTER TABLE affiliates ADD COLUMN IF NOT EXISTS updated_at                    TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_affiliates_referrer ON affiliates(referrer_va_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_referred ON affiliates(referred_va_id);
CREATE INDEX IF NOT EXISTS idx_affiliates_active   ON affiliates(is_active);

-- RLS for affiliates
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on affiliates" ON affiliates;
CREATE POLICY "Allow all on affiliates" ON affiliates FOR ALL USING (true) WITH CHECK (true);

-- auto-update trigger
CREATE OR REPLACE FUNCTION update_affiliates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS affiliates_updated_at ON affiliates;
CREATE TRIGGER affiliates_updated_at
  BEFORE UPDATE ON affiliates
  FOR EACH ROW
  EXECUTE FUNCTION update_affiliates_updated_at();

-- ─── 2. Referral codes table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_codes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id                UUID NOT NULL REFERENCES vas(id) ON DELETE CASCADE UNIQUE,
  code                 TEXT NOT NULL UNIQUE,
  link                 TEXT NOT NULL,
  total_referrals      INTEGER DEFAULT 0,
  active_referrals     INTEGER DEFAULT 0,
  total_earned         DECIMAL DEFAULT 0,
  current_month_earned DECIMAL DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code  ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_va_id ON referral_codes(va_id);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on referral_codes" ON referral_codes;
CREATE POLICY "Allow all on referral_codes" ON referral_codes FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. Affiliate payouts table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_va_id    UUID NOT NULL REFERENCES vas(id),
  affiliate_id      UUID NOT NULL REFERENCES affiliates(id),
  referred_va_id    UUID NOT NULL REFERENCES vas(id),
  month             TEXT NOT NULL,
  referred_va_fee   DECIMAL NOT NULL,
  payout_percentage DECIMAL NOT NULL DEFAULT 20,
  payout_amount     DECIMAL NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'skipped', 'waived')),
  reason_skipped    TEXT,
  is_free_month     BOOLEAN DEFAULT false,
  paid_at           TIMESTAMPTZ,
  payment_reference TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_referrer ON affiliate_payouts(referrer_va_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_month    ON affiliate_payouts(month);
CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_status   ON affiliate_payouts(status);

ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on affiliate_payouts" ON affiliate_payouts;
CREATE POLICY "Allow all on affiliate_payouts" ON affiliate_payouts FOR ALL USING (true) WITH CHECK (true);

-- ─── 4. VA status: add 'paused' if missing ───────────────────────────────────
-- (needed for billing escalation)
-- ALTER TABLE vas ALTER COLUMN status TYPE TEXT; -- already text in most setups
-- No-op if already present
