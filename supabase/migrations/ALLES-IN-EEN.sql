-- ═══════════════════════════════════════════════════════════════════════════
-- HIGHERUP — ALLES IN ÉÉN MIGRATIE
-- Plak dit in Supabase SQL Editor en klik Run.
-- Veilig: gebruikt IF NOT EXISTS overal.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. ACTIVITY_LOG (aanmaken als die nog niet bestaat)
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT        NOT NULL,
  details      TEXT,
  va_id        UUID        REFERENCES vas(id)     ON DELETE SET NULL,
  admin_id     TEXT,
  client_id    UUID        REFERENCES clients(id) ON DELETE SET NULL,
  upload_id    UUID,
  billing_id   UUID,
  affiliate_id UUID,
  request_id   UUID,
  source       TEXT        DEFAULT 'system' CHECK (source   IN ('va','admin','system','api')),
  severity     TEXT        DEFAULT 'info'   CHECK (severity IN ('info','warning','error','critical')),
  ip_address   TEXT,
  user_agent   TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Extra kolommen toevoegen als ze nog missen
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS admin_id     TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS client_id    UUID;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS upload_id    UUID;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS billing_id   UUID;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS affiliate_id UUID;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS request_id   UUID;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ip_address   TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_agent   TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS metadata     JSONB;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS severity     TEXT DEFAULT 'info';
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS source       TEXT DEFAULT 'system';

ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_action_check;

CREATE INDEX IF NOT EXISTS idx_activity_log_va_id      ON activity_log(va_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action     ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_severity   ON activity_log(severity) WHERE severity != 'info';
CREATE INDEX IF NOT EXISTS idx_activity_log_upload_id  ON activity_log(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_billing_id ON activity_log(billing_id) WHERE billing_id IS NOT NULL;

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_activity_log" ON activity_log;
CREATE POLICY "open_activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 2. UPLOADS — alle missende kolommen
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_filename       TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS file_size_bytes         INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sheet_name              TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS detected_as_shopify     BOOLEAN DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS input_file_path         TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_file_path        TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS unique_product_count    INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS image_row_count         INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS column_mapping          JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS special_instructions    TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS pre_check_result        JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS adjusted_instruction    TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_columns          JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS image_settings          JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS price_rules             JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_time_seconds INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_started_at   TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_completed_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_total           INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_completed       INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_failed          INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS products_optimized      INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS products_failed         INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_input_tokens        INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_output_tokens       INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_cached_tokens       INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_cost_usd            DECIMAL(10,6);
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_calls_count         INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_downloaded       BOOLEAN     DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_downloaded_at    TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS download_count          INTEGER     DEFAULT 0;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS held_reason             TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS released_by             TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS released_at             TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS retry_count             INTEGER     DEFAULT 0;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS retried_from_upload_id  UUID;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_upload_id      UUID;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ DEFAULT now();
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolved            BOOLEAN     DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolved_at        TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolved_by        TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolution         TEXT;

-- Status constraint: voeg on_hold toe
ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_status_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_status_check
  CHECK (status IN ('queued','processing','done','failed','on_hold'));

CREATE INDEX IF NOT EXISTS idx_uploads_va_id       ON uploads(va_id);
CREATE INDEX IF NOT EXISTS idx_uploads_client_id   ON uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status      ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at ON uploads(uploaded_at);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on uploads" ON uploads;
CREATE POLICY "Allow all on uploads" ON uploads FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 3. VAS — missende kolommen
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE vas ADD COLUMN IF NOT EXISTS admin_notes    TEXT;
ALTER TABLE vas ADD COLUMN IF NOT EXISTS deleted_at     TIMESTAMPTZ;
ALTER TABLE vas ADD COLUMN IF NOT EXISTS mismatch_count INTEGER DEFAULT 0;

-- Status constraint: voeg deleted toe
ALTER TABLE vas DROP CONSTRAINT IF EXISTS vas_status_check;
ALTER TABLE vas ADD CONSTRAINT vas_status_check
  CHECK (status IN ('pending_approval','active','paused','blocked','deleted'));


-- ───────────────────────────────────────────────────────────────────────────
-- 4. CLIENTS — missende kolommen
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE clients ADD COLUMN IF NOT EXISTS admin_notes         TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deactivated_at      TIMESTAMPTZ;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. BILLING — aanmaken als niet bestaat
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number          TEXT,
  va_id                   UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  month                   TEXT        NOT NULL,
  va_name                 TEXT,
  va_email                TEXT,
  va_payment_method       TEXT,
  va_payment_details      JSONB,
  total_variants          INTEGER,
  total_clients           INTEGER,
  total_amount            DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency                TEXT        DEFAULT 'USD',
  status                  TEXT        NOT NULL DEFAULT 'outstanding'
                            CHECK (status IN ('outstanding','paid','overdue','waived')),
  due_date                TIMESTAMPTZ,
  generated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                 TIMESTAMPTZ,
  payment_method_used     TEXT,
  payment_reference       TEXT,
  payment_amount_received DECIMAL(10,2),
  wise_transfer_id        TEXT,
  reminded_at             TIMESTAMPTZ,
  paused_at               TIMESTAMPTZ,
  blocked_at              TIMESTAMPTZ,
  notes                   TEXT,
  created_by              TEXT,
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_va_id      ON billing(va_id);
CREATE INDEX IF NOT EXISTS idx_billing_month      ON billing(month);
CREATE INDEX IF NOT EXISTS idx_billing_status     ON billing(status);

ALTER TABLE billing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on billing" ON billing;
CREATE POLICY "Allow all on billing" ON billing FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 6. BILLING LINE ITEMS — aanmaken als niet bestaat
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_line_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id          UUID        NOT NULL REFERENCES billing(id) ON DELETE CASCADE,
  client_id           UUID        REFERENCES clients(id) ON DELETE SET NULL,
  store_name          TEXT        NOT NULL,
  niche               TEXT,
  variant_count       INTEGER     NOT NULL DEFAULT 0,
  unique_product_count INTEGER,
  tier                TEXT        NOT NULL CHECK (tier IN ('tier_1','tier_2','tier_3','tier_4')),
  amount              DECIMAL(10,2) NOT NULL DEFAULT 0,
  upload_count        INTEGER,
  first_upload_at     TIMESTAMPTZ,
  last_upload_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_li_billing_id ON billing_line_items(billing_id);
CREATE INDEX IF NOT EXISTS idx_billing_li_client_id  ON billing_line_items(client_id);

ALTER TABLE billing_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on billing_line_items" ON billing_line_items;
CREATE POLICY "Allow all on billing_line_items" ON billing_line_items FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 7. AFFILIATES — aanmaken als niet bestaat
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliates (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_va_id               UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  referred_va_id               UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  referral_code                TEXT,
  referred_at                  TIMESTAMPTZ DEFAULT now(),
  is_active                    BOOLEAN     DEFAULT true,
  referred_va_name             TEXT,
  referred_va_country          TEXT,
  referred_va_status           TEXT,
  referred_va_onboarded        BOOLEAN,
  referred_va_first_upload_at  TIMESTAMPTZ,
  referred_va_joined_month     TEXT,
  free_month_used              BOOLEAN     DEFAULT false,
  payout_percentage            DECIMAL(5,2),
  months_active                INTEGER     DEFAULT 0,
  months_paid                  INTEGER     DEFAULT 0,
  total_referred_va_paid       DECIMAL(10,2) DEFAULT 0,
  total_payout_earned          DECIMAL(10,2) DEFAULT 0,
  current_month_referred_fee   DECIMAL(10,2),
  current_month_payout_amount  DECIMAL(10,2),
  current_month_referred_paid  BOOLEAN     DEFAULT false,
  last_payout_at               TIMESTAMPTZ,
  notes                        TEXT,
  updated_at                   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on affiliates" ON affiliates;
CREATE POLICY "Allow all on affiliates" ON affiliates FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 8. AFFILIATE PAYOUTS — aanmaken als niet bestaat
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_payouts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_va_id    UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  affiliate_id      UUID        REFERENCES affiliates(id) ON DELETE SET NULL,
  referred_va_id    UUID        REFERENCES vas(id) ON DELETE SET NULL,
  month             TEXT        NOT NULL,
  referred_va_fee   DECIMAL(10,2) NOT NULL DEFAULT 0,
  payout_percentage DECIMAL(5,2)  NOT NULL DEFAULT 20,
  payout_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','skipped','waived')),
  reason_skipped    TEXT,
  is_free_month     BOOLEAN     DEFAULT false,
  paid_at           TIMESTAMPTZ,
  payment_reference TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE affiliate_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on affiliate_payouts" ON affiliate_payouts;
CREATE POLICY "Allow all on affiliate_payouts" ON affiliate_payouts FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 9. REFERRAL CODES — aanmaken als niet bestaat
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_codes (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id                     UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  code                      TEXT        NOT NULL UNIQUE,
  link                      TEXT,
  total_referrals           INTEGER     DEFAULT 0,
  active_referrals          INTEGER     DEFAULT 0,
  total_earned              DECIMAL(10,2) DEFAULT 0,
  current_month_earned      DECIMAL(10,2) DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT now(),
  payment_streak            INTEGER     DEFAULT 0,
  current_percentage        DECIMAL(5,2) DEFAULT 20,
  highest_streak            INTEGER     DEFAULT 0,
  streak_lost_count         INTEGER     DEFAULT 0,
  next_tier_at              INTEGER,
  potential_monthly_earnings DECIMAL(10,2),
  actual_monthly_earnings   DECIMAL(10,2),
  last_streak_reset_month   TEXT,
  streak_last_updated_month TEXT
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on referral_codes" ON referral_codes;
CREATE POLICY "Allow all on referral_codes" ON referral_codes FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 10. PROFILE CHANGE REQUESTS — aanmaken als niet bestaat
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profile_change_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id        UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  request_text TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

ALTER TABLE profile_change_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on profile_change_requests" ON profile_change_requests;
CREATE POLICY "Allow all on profile_change_requests" ON profile_change_requests FOR ALL USING (true) WITH CHECK (true);


-- ───────────────────────────────────────────────────────────────────────────
-- 11. CLIENT PROFILES — aanmaken als niet bestaat
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_profiles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID        NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  prompt_id  UUID        REFERENCES prompts(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on client_profiles" ON client_profiles;
CREATE POLICY "Allow all on client_profiles" ON client_profiles FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS custom_requirements BOOLEAN,
  ADD COLUMN IF NOT EXISTS custom_data         JSONB;


-- ───────────────────────────────────────────────────────────────────────────
-- 12. PROMPT REQUESTS
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID        NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  va_id             UUID        NOT NULL REFERENCES vas(id)      ON DELETE CASCADE,
  message           TEXT,
  file_urls         TEXT[]      NOT NULL DEFAULT '{}',
  file_names        TEXT[]      NOT NULL DEFAULT '{}',
  file_paths        TEXT[]               DEFAULT '{}',
  structured_data   JSONB,
  linked_prompt_id  UUID        REFERENCES prompts(id) ON DELETE SET NULL,
  status            TEXT        NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted', 'reviewed', 'applied', 'rejected')),
  admin_response    TEXT,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  applied_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE prompt_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on prompt_requests" ON prompt_requests;
CREATE POLICY "Allow all on prompt_requests"
  ON prompt_requests FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_prompt_requests_va_id     ON prompt_requests (va_id);
CREATE INDEX IF NOT EXISTS idx_prompt_requests_client_id ON prompt_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_prompt_requests_status    ON prompt_requests (status);


-- ───────────────────────────────────────────────────────────────────────────
-- KLAAR — controleer de uploads kolommen
-- ───────────────────────────────────────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'uploads'
ORDER BY ordinal_position;
