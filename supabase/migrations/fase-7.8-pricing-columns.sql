-- FASE 7.8: Client-level pricing columns on client_profiles

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS max_discount          DECIMAL,
  ADD COLUMN IF NOT EXISTS competitor_price_diff DECIMAL,
  ADD COLUMN IF NOT EXISTS price_ending          TEXT,
  ADD COLUMN IF NOT EXISTS pricing_basis         TEXT;
