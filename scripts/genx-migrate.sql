-- ===========================================================
-- GENX TOOLKIT MIGRATION — RUN EENMALIG IN SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/sclkuperapiffpwmxbmn/sql/new
-- ===========================================================
-- STATUS: 30 scripts zijn AL geseed via het seed script.
--         Dit SQL voegt alleen de ontbrekende kolommen toe.
--
-- STAP 1: Plak dit in Supabase SQL Editor
-- STAP 2: Klik op Run
-- STAP 3: Klaar — de Weekly Planner en My Scripts worden actief
-- ===========================================================

-- ─────────────────────────────────────────────────────────────
-- 1. GENX_TOOLKIT: voeg ontbrekende kolommen toe
-- ─────────────────────────────────────────────────────────────
ALTER TABLE genx_toolkit
  ADD COLUMN IF NOT EXISTS subcategory     TEXT,
  ADD COLUMN IF NOT EXISTS channel         TEXT DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS sort_order      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Vul subcategory in vanuit de category kolom (pre-migratie mapping)
UPDATE genx_toolkit
SET subcategory = category
WHERE subcategory IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. LG_CUSTOM_SCRIPTS — persoonlijke scripts per LG
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lg_custom_scripts (
  id                UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id             UUID      NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  category          TEXT      NOT NULL DEFAULT 'custom',
  channel           TEXT      DEFAULT 'general',
  title             TEXT      NOT NULL,
  content           TEXT      NOT NULL,
  notes             TEXT,
  is_modified_from  UUID,
  times_used        INTEGER   DEFAULT 0,
  times_converted   INTEGER   DEFAULT 0,
  conversion_note   TEXT,
  is_pinned         BOOLEAN   DEFAULT false,
  sort_order        INTEGER   DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lg_custom_scripts_lg
  ON lg_custom_scripts (lg_id, is_pinned DESC, sort_order ASC);

-- ─────────────────────────────────────────────────────────────
-- 3. LG_WEEKLY_ACTIVITY — outreach tellers per dag
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lg_weekly_activity (
  id             UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  lg_id          UUID      NOT NULL REFERENCES lead_generators(id) ON DELETE CASCADE,
  week_start     DATE      NOT NULL,
  day_of_week    INTEGER   NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  dms_sent       INTEGER   DEFAULT 0,
  posts_made     INTEGER   DEFAULT 0,
  followups_sent INTEGER   DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lg_id, week_start, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_lg_weekly_activity_lg
  ON lg_weekly_activity (lg_id, week_start);

-- ─────────────────────────────────────────────────────────────
-- VERIFICATIE
-- ─────────────────────────────────────────────────────────────
SELECT 'genx_toolkit'      AS tbl, COUNT(*) AS rows FROM genx_toolkit   WHERE active = true
UNION ALL
SELECT 'lg_custom_scripts', COUNT(*) FROM lg_custom_scripts
UNION ALL
SELECT 'lg_weekly_activity', COUNT(*) FROM lg_weekly_activity;
