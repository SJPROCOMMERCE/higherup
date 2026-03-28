-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 6.x CATCH-UP — All missing columns across all tables
-- Covers: fase 5.5 (uploads), fase 6.5 (vas), fase 6.7 (uploads + vas)
-- Safe to run multiple times — all use IF NOT EXISTS / OR REPLACE
-- Run in: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. UPLOADS TABLE — all columns from fase 5.5 spec + 6.7 flag columns
-- ═══════════════════════════════════════════════════════════════════════════

-- File info
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_filename    TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS file_size_bytes      INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sheet_name           TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS detected_as_shopify  BOOLEAN DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS input_file_path      TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_file_path     TEXT;

-- Product counting
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS unique_product_count INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS image_row_count      INTEGER;

-- Column mapping & instructions
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS column_mapping        JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS special_instructions  TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS pre_check_result      JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS adjusted_instruction  TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_columns        JSONB;

-- Image & price settings
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS image_settings JSONB;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS price_rules    JSONB;

-- Processing details
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_time_seconds   INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_started_at     TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS processing_completed_at   TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_total             INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_completed         INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS batches_failed            INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS products_optimized        INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS products_failed           INTEGER;

-- API cost tracking
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_input_tokens   INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_output_tokens  INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_cached_tokens  INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_cost_usd       DECIMAL(10, 6);
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS api_calls_count    INTEGER;

-- Download tracking
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_downloaded    BOOLEAN     DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS output_downloaded_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS download_count       INTEGER     DEFAULT 0;

-- Admin / on_hold
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS held_reason  TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS released_by  TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS released_at  TIMESTAMPTZ;

-- Retry tracking
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS retry_count             INTEGER DEFAULT 0;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS retried_from_upload_id  UUID REFERENCES uploads(id);
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS original_upload_id      UUID REFERENCES uploads(id);

-- Timestamps
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 6.7 — Flag resolution
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolved    BOOLEAN     DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolved_at TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolved_by TEXT;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS flag_resolution  TEXT;

-- Ensure 'on_hold' is allowed in status (drop old constraint if any, recreate)
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'uploads' AND constraint_name = 'uploads_status_check'
  ) THEN
    ALTER TABLE uploads DROP CONSTRAINT uploads_status_check;
  END IF;

  -- Add new constraint with on_hold
  ALTER TABLE uploads ADD CONSTRAINT uploads_status_check
    CHECK (status IN ('queued', 'processing', 'done', 'failed', 'on_hold'));
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. VAS TABLE — fase 6.5 + 6.7 columns
-- ═══════════════════════════════════════════════════════════════════════════

-- fase 6.5
ALTER TABLE vas ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE vas ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ;

-- fase 6.7 — mismatch tracking
ALTER TABLE vas ADD COLUMN IF NOT EXISTS mismatch_count INTEGER DEFAULT 0;

-- Allow 'deleted' as a valid status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'vas' AND constraint_name = 'vas_status_check'
  ) THEN
    ALTER TABLE vas DROP CONSTRAINT vas_status_check;
  END IF;

  ALTER TABLE vas ADD CONSTRAINT vas_status_check
    CHECK (status IN ('pending_approval', 'active', 'paused', 'blocked', 'deleted'));
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CLIENTS TABLE — admin_notes (fase 6.6 uses it)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE clients ADD COLUMN IF NOT EXISTS admin_notes        TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deactivated_at     TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ACTIVITY LOG TABLE — store_mismatch support
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure activity_log has all needed columns (no schema change needed, action is text)
-- Just verify the table exists; if not this will fail loudly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'activity_log'
  ) THEN
    RAISE EXCEPTION 'activity_log table does not exist — run fase-5.9-activity-log.sql first';
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. INDEXES — uploads (safe to re-run)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_uploads_va_id        ON uploads(va_id);
CREATE INDEX IF NOT EXISTS idx_uploads_client_id    ON uploads(client_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status       ON uploads(status);
CREATE INDEX IF NOT EXISTS idx_uploads_uploaded_at  ON uploads(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_uploads_va_status    ON uploads(va_id, status);
CREATE INDEX IF NOT EXISTS idx_uploads_flag         ON uploads(flag_resolved, status)
  WHERE flag_resolved = false;
CREATE INDEX IF NOT EXISTS idx_uploads_client_month ON uploads(client_id, uploaded_at)
  WHERE status = 'done';


-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS — ensure permissive policies exist
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on uploads" ON uploads;
CREATE POLICY "Allow all on uploads" ON uploads FOR ALL USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════════════
-- 7. auto-update updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_uploads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS uploads_updated_at ON uploads;
CREATE TRIGGER uploads_updated_at
  BEFORE UPDATE ON uploads
  FOR EACH ROW
  EXECUTE FUNCTION update_uploads_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 8. VERIFY — list all uploads columns (check output in results)
-- ═══════════════════════════════════════════════════════════════════════════

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'uploads'
ORDER BY ordinal_position;
