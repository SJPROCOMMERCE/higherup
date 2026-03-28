-- ─── Phase 6.9 Prompt Management: Variables System ───────────────────────────

-- Add prompt_variables JSONB column to client_profiles
ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS prompt_variables JSONB DEFAULT '{}';

-- Index for prompt_variables queries
CREATE INDEX IF NOT EXISTS idx_client_profiles_prompt_variables
  ON client_profiles USING GIN (prompt_variables);

-- Comment
COMMENT ON COLUMN client_profiles.prompt_variables IS
  'Stores per-client values for {{variable}} placeholders in the linked prompt template';
