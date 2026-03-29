-- FASE 7.6: Track which prompt template was used per upload

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_prompt_id ON uploads (prompt_id);
