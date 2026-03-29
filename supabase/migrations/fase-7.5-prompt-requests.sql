-- FASE 7.5: Prompt Requests + Client Profile Extensions

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. prompt_requests table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_requests (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID        NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  va_id             UUID        NOT NULL REFERENCES vas(id)      ON DELETE CASCADE,

  -- Content
  message           TEXT,
  file_urls         TEXT[]      NOT NULL DEFAULT '{}',
  file_names        TEXT[]      NOT NULL DEFAULT '{}',
  file_paths        TEXT[]               DEFAULT '{}',
  structured_data   JSONB,
  linked_prompt_id  UUID        REFERENCES prompts(id) ON DELETE SET NULL,

  -- Status
  status            TEXT        NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted', 'reviewed', 'applied', 'rejected')),

  -- Admin handling
  admin_response    TEXT,
  reviewed_by       TEXT,
  reviewed_at       TIMESTAMPTZ,
  applied_at        TIMESTAMPTZ,

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_prompt_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prompt_requests_updated_at ON prompt_requests;
CREATE TRIGGER trg_prompt_requests_updated_at
  BEFORE UPDATE ON prompt_requests
  FOR EACH ROW EXECUTE FUNCTION update_prompt_requests_updated_at();

-- RLS: open (admin + VA anon key)
ALTER TABLE prompt_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on prompt_requests" ON prompt_requests;
CREATE POLICY "Allow all on prompt_requests"
  ON prompt_requests FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prompt_requests_va_id     ON prompt_requests (va_id);
CREATE INDEX IF NOT EXISTS idx_prompt_requests_client_id ON prompt_requests (client_id);
CREATE INDEX IF NOT EXISTS idx_prompt_requests_status    ON prompt_requests (status);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. client_profiles — add custom requirements columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS custom_requirements BOOLEAN,
  ADD COLUMN IF NOT EXISTS custom_data         JSONB;
