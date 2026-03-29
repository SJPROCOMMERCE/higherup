-- FASE 7.7: client_prompts junction table (many templates per client)

CREATE TABLE IF NOT EXISTS client_prompts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES clients(id)  ON DELETE CASCADE,
  prompt_id   UUID        NOT NULL REFERENCES prompts(id)  ON DELETE CASCADE,
  assigned_by TEXT        NOT NULL DEFAULT 'admin',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, prompt_id)
);

ALTER TABLE client_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on client_prompts" ON client_prompts;
CREATE POLICY "Allow all on client_prompts"
  ON client_prompts FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_client_prompts_client_id ON client_prompts (client_id);
CREATE INDEX IF NOT EXISTS idx_client_prompts_prompt_id ON client_prompts (prompt_id);

-- Migrate existing client_profiles.prompt_id → client_prompts
INSERT INTO client_prompts (client_id, prompt_id, assigned_by)
SELECT client_id, prompt_id, 'admin'
FROM client_profiles
WHERE prompt_id IS NOT NULL
ON CONFLICT (client_id, prompt_id) DO NOTHING;
