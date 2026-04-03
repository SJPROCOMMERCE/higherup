-- ============================================================
-- FASE 11: GENX — Lead Generator Intelligence Platform
-- ============================================================

-- Lead Generators (custom auth, no Supabase Auth dependency)
CREATE TABLE IF NOT EXISTS lead_generators (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name     TEXT NOT NULL,
  email            TEXT UNIQUE,
  login_code       TEXT UNIQUE NOT NULL,          -- 6-char alphanumeric code
  referral_code    TEXT NOT NULL UNIQUE,          -- 'maria-c-7x9k'
  status           TEXT NOT NULL DEFAULT 'pending',
  payout_method    JSONB,
  minimum_payout   NUMERIC(10,2) NOT NULL DEFAULT 10.00,
  total_earnings   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_referred   INTEGER NOT NULL DEFAULT 0,
  active_referred  INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lg_referral_code ON lead_generators(referral_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lg_login_code    ON lead_generators(login_code);
CREATE INDEX        IF NOT EXISTS idx_lg_status        ON lead_generators(status);


-- Referral Tracking (VA → LG link, permanent)
CREATE TABLE IF NOT EXISTS referral_tracking (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id                  UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  va_id                  UUID NOT NULL UNIQUE REFERENCES vas(id) ON DELETE CASCADE,
  referral_code_used     TEXT NOT NULL,
  signed_up_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_upload_at        TIMESTAMPTZ,
  last_active_at         TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'signed_up',
  total_products_lifetime INTEGER NOT NULL DEFAULT 0,
  products_this_month    INTEGER NOT NULL DEFAULT 0,
  products_last_month    INTEGER NOT NULL DEFAULT 0,
  velocity_percent       NUMERIC(5,1) DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_lg     ON referral_tracking(lg_id);
CREATE INDEX IF NOT EXISTS idx_referral_va     ON referral_tracking(va_id);
CREATE INDEX IF NOT EXISTS idx_referral_status ON referral_tracking(lg_id, status);


-- Referral Clicks (link analytics)
CREATE TABLE IF NOT EXISTS referral_clicks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id          UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  referral_code  TEXT NOT NULL,
  ip_hash        TEXT,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clicks_lg   ON referral_clicks(lg_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_code ON referral_clicks(referral_code, created_at DESC);


-- LG Earnings (per upload/usage event)
CREATE TABLE IF NOT EXISTS lg_earnings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id          UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  va_id          UUID NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  usage_id       UUID REFERENCES va_usage(id) ON DELETE SET NULL,
  billing_month  TEXT NOT NULL,
  product_count  INTEGER NOT NULL,
  earning_rate   NUMERIC(10,4) NOT NULL DEFAULT 0.05,
  amount         NUMERIC(10,2) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lg_earnings_lg_month ON lg_earnings(lg_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_lg_earnings_va       ON lg_earnings(va_id, billing_month);
CREATE INDEX IF NOT EXISTS idx_lg_earnings_month    ON lg_earnings(billing_month);


-- LG Payouts (monthly)
CREATE TABLE IF NOT EXISTS lg_payouts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id              UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  billing_month      TEXT NOT NULL,
  total_earnings     NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  payout_amount      NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  rolled_over        NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_products     INTEGER NOT NULL DEFAULT 0,
  total_active_vas   INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'pending',
  paid_at            TIMESTAMPTZ,
  payment_reference  TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lg_payouts_lg_month ON lg_payouts(lg_id, billing_month);
CREATE INDEX        IF NOT EXISTS idx_lg_payouts_status   ON lg_payouts(status);


-- Pulse Events (real-time feed, 7-day rolling)
CREATE TABLE IF NOT EXISTS lg_pulse_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id            UUID NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  va_id            UUID REFERENCES vas(id) ON DELETE SET NULL,
  va_display_name  TEXT,
  product_count    INTEGER,
  earning_amount   NUMERIC(10,2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_lg ON lg_pulse_events(lg_id, created_at DESC);


-- ============================================================
-- RLS (open, consistent with rest of project)
-- ============================================================

ALTER TABLE lead_generators  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_earnings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_payouts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lg_pulse_events    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_lead_generators"   ON lead_generators   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_referral_tracking" ON referral_tracking FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_referral_clicks"   ON referral_clicks   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lg_earnings"       ON lg_earnings        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lg_payouts"        ON lg_payouts         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lg_pulse_events"   ON lg_pulse_events    FOR ALL USING (true) WITH CHECK (true);


-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE lg_pulse_events;
ALTER PUBLICATION supabase_realtime ADD TABLE lg_earnings;
ALTER PUBLICATION supabase_realtime ADD TABLE referral_tracking;


-- ============================================================
-- RPC: atomic earnings increment
-- ============================================================

CREATE OR REPLACE FUNCTION increment_lg_earnings(lg_id_input UUID, amount_input NUMERIC)
RETURNS VOID AS $$
BEGIN
  UPDATE lead_generators
  SET total_earnings = total_earnings + amount_input,
      updated_at     = now()
  WHERE id = lg_id_input;
END;
$$ LANGUAGE plpgsql;
