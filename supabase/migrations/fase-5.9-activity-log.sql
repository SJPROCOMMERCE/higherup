-- ─── Fase 5.9 — Activity Log: Complete & Watertight ──────────────────────────

-- ─── Extend existing activity_log table ──────────────────────────────────────

ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS admin_id      TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS client_id     UUID REFERENCES clients(id)                ON DELETE SET NULL;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS upload_id     UUID REFERENCES uploads(id)                ON DELETE SET NULL;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS billing_id    UUID REFERENCES billing(id)                ON DELETE SET NULL;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS affiliate_id  UUID REFERENCES affiliates(id)             ON DELETE SET NULL;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS request_id    UUID REFERENCES profile_change_requests(id) ON DELETE SET NULL;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ip_address    TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_agent    TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS metadata      JSONB;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS severity      TEXT DEFAULT 'info'   CHECK (severity IN ('info', 'warning', 'error', 'critical'));
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS source        TEXT DEFAULT 'system' CHECK (source  IN ('va', 'admin', 'system', 'api'));

-- Drop old restrictive action check (we now support many action types)
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_action_check;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_activity_log_va_id      ON activity_log(va_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action     ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_severity   ON activity_log(severity) WHERE severity != 'info';
CREATE INDEX IF NOT EXISTS idx_activity_log_client_id  ON activity_log(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_source     ON activity_log(source);
CREATE INDEX IF NOT EXISTS idx_activity_log_va_date    ON activity_log(va_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_upload_id  ON activity_log(upload_id) WHERE upload_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_billing_id ON activity_log(billing_id) WHERE billing_id IS NOT NULL;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "open_activity_log" ON activity_log;
CREATE POLICY "open_activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);

-- ─── Cleanup functions ────────────────────────────────────────────────────────

-- Delete info logs older than 90 days (warning/error/critical kept forever)
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM activity_log
  WHERE created_at < now() - INTERVAL '90 days'
    AND severity = 'info';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Delete api_call_made logs older than 30 days (most voluminous)
CREATE OR REPLACE FUNCTION cleanup_api_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM activity_log
  WHERE created_at < now() - INTERVAL '30 days'
    AND action = 'api_call_made';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
