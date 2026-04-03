-- fase-8.3: Add title_preference + description_style to clients table

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS title_preference   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_style  TEXT DEFAULT NULL;

-- Drop any stale check constraints that might reject valid values
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_title_preference_check;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_description_style_check;

-- Add fresh constraints
ALTER TABLE clients
  ADD CONSTRAINT clients_title_preference_check
  CHECK (title_preference IN ('short', 'medium', 'long'));

ALTER TABLE clients
  ADD CONSTRAINT clients_description_style_check
  CHECK (description_style IN ('minimal', 'standard', 'detailed', 'emotional', 'technical', 'casual', 'luxury', 'neutral'));
