-- ─────────────────────────────────────────────────────────────────────────────
-- FASE 5.4 — Prompts table full migration
-- Run in: Supabase → SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add missing columns to prompts table
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS description             TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS market                  TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS title_instructions      TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS description_instructions TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS seo_instructions        TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS formatting_rules        TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS alt_text_instructions   TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS filename_instructions   TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS tags_instructions       TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS price_rules_instructions TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS tone_examples           TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS title_examples          TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS description_examples    TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS forbidden_words         TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS required_keywords       TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS max_title_length        INTEGER;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS max_description_length  INTEGER;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS html_allowed            BOOLEAN DEFAULT true;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS emoji_allowed           BOOLEAN DEFAULT false;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_active               BOOLEAN DEFAULT true;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_default              BOOLEAN DEFAULT false;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS parent_prompt_id        UUID REFERENCES prompts(id);
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS usage_count             INTEGER DEFAULT 0;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS last_used_at            TIMESTAMPTZ;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS created_by              TEXT;
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS updated_by              TEXT;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_prompts_niche          ON prompts(niche);
CREATE INDEX IF NOT EXISTS idx_prompts_language       ON prompts(language);
CREATE INDEX IF NOT EXISTS idx_prompts_is_active      ON prompts(is_active);
CREATE INDEX IF NOT EXISTS idx_prompts_niche_language ON prompts(niche, language);

-- 3. RLS for prompts
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on prompts" ON prompts;
CREATE POLICY "Allow all on prompts" ON prompts FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Prompt versions table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_versions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id                UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  version                  INTEGER NOT NULL,
  system_prompt            TEXT,
  title_instructions       TEXT,
  description_instructions TEXT,
  seo_instructions         TEXT,
  tags_instructions        TEXT,
  formatting_rules         TEXT,
  changed_by               TEXT,
  change_notes             TEXT,
  created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt_id ON prompt_versions(prompt_id);

ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on prompt_versions" ON prompt_versions;
CREATE POLICY "Allow all on prompt_versions" ON prompt_versions FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Insert 8 placeholder templates
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO prompts (
  name, description, niche, language, market,
  system_prompt, title_instructions, description_instructions,
  seo_instructions, tags_instructions,
  html_allowed, emoji_allowed, is_active, is_default, version
) VALUES
  (
    'Fashion — English — Emotional',
    'For English-language fashion stores. Emotional, lifestyle-focused tone.',
    'fashion', 'english', NULL,
    '[PLACEHOLDER: Main system prompt for English fashion stores]',
    '[PLACEHOLDER: Title instructions for fashion products]',
    '[PLACEHOLDER: Description instructions — emotional, lifestyle-focused]',
    '[PLACEHOLDER: SEO title and meta description guidelines for fashion]',
    '[PLACEHOLDER: Tag generation rules for fashion niche]',
    true, false, true, true, 1
  ),
  (
    'Fashion — German — Emotional',
    'Für deutschsprachige Modeshops. Emotionaler, lifestyle-orientierter Stil.',
    'fashion', 'german', 'Germany',
    '[PLACEHOLDER: Haupt-Systemprompt für deutsche Modeshops]',
    '[PLACEHOLDER: Titelanweisungen für Mode-Produkte auf Deutsch]',
    '[PLACEHOLDER: Beschreibungsanweisungen — emotional, lifestyle-fokussiert]',
    '[PLACEHOLDER: SEO-Anweisungen für Titel und Meta-Description auf Deutsch]',
    '[PLACEHOLDER: Tag-Regeln für den Fashion-Niche auf Deutsch]',
    true, false, true, true, 1
  ),
  (
    'Electronics — English — Technical',
    'For English-language electronics stores. Technical, specification-driven tone.',
    'electronics', 'english', NULL,
    '[PLACEHOLDER: Main system prompt for English electronics stores]',
    '[PLACEHOLDER: Title instructions — include key specs, model numbers]',
    '[PLACEHOLDER: Description instructions — technical, feature-driven]',
    '[PLACEHOLDER: SEO guidelines for electronics products]',
    '[PLACEHOLDER: Tag rules — specs, brands, compatibility, model numbers]',
    true, false, true, true, 1
  ),
  (
    'Beauty — English — Luxury',
    'For English-language beauty and skincare stores. Luxury, premium tone.',
    'beauty', 'english', NULL,
    '[PLACEHOLDER: Main system prompt for English beauty/skincare stores]',
    '[PLACEHOLDER: Title instructions — evocative, benefit-driven titles]',
    '[PLACEHOLDER: Description instructions — luxury, sensory, aspirational]',
    '[PLACEHOLDER: SEO guidelines for beauty products]',
    '[PLACEHOLDER: Tag rules — ingredients, skin type, benefits, concerns]',
    true, false, true, true, 1
  ),
  (
    'Home & Garden — English — Neutral',
    'For English-language home & garden stores. Clear, practical, helpful tone.',
    'home_garden', 'english', NULL,
    '[PLACEHOLDER: Main system prompt for English home & garden stores]',
    '[PLACEHOLDER: Title instructions — functional, descriptive, room/use-case]',
    '[PLACEHOLDER: Description instructions — practical, benefit-focused]',
    '[PLACEHOLDER: SEO guidelines for home & garden products]',
    '[PLACEHOLDER: Tag rules — room, style, material, function]',
    true, false, true, true, 1
  ),
  (
    'Health — English — Casual',
    'For English-language health and wellness stores. Approachable, casual tone.',
    'health', 'english', NULL,
    '[PLACEHOLDER: Main system prompt for English health & wellness stores]',
    '[PLACEHOLDER: Title instructions — friendly, benefit-focused, clear]',
    '[PLACEHOLDER: Description instructions — casual, accessible, informative]',
    '[PLACEHOLDER: SEO guidelines for health & wellness products]',
    '[PLACEHOLDER: Tag rules — health goals, ingredients, certifications]',
    true, false, true, true, 1
  ),
  (
    'Fashion — Dutch — Emotional',
    'Voor Nederlandstalige modewinkels. Emotioneel, lifestyle-gericht.',
    'fashion', 'dutch', 'Netherlands',
    '[PLACEHOLDER: Hoofd systeem prompt voor Nederlandse modewinkels]',
    '[PLACEHOLDER: Titelinstructies voor modeproducten in het Nederlands]',
    '[PLACEHOLDER: Beschrijvingsinstructies — emotioneel, lifestyle-gericht]',
    '[PLACEHOLDER: SEO-richtlijnen voor titels en meta-beschrijvingen in NL]',
    '[PLACEHOLDER: Tag-regels voor fashion niche in het Nederlands]',
    true, false, true, true, 1
  ),
  (
    'General — English — Neutral',
    'Universal fallback for any English store. Balanced, professional, neutral.',
    'other', 'english', NULL,
    '[PLACEHOLDER: General-purpose system prompt for any English-language store]',
    '[PLACEHOLDER: General title instructions — clear, descriptive, SEO-friendly]',
    '[PLACEHOLDER: General description instructions — neutral, professional]',
    '[PLACEHOLDER: General SEO guidelines for any product type]',
    '[PLACEHOLDER: General tag rules — product type, brand, use case]',
    true, false, true, false, 1
  )
ON CONFLICT DO NOTHING;
