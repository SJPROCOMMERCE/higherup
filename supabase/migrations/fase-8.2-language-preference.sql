-- FASE 8.2: Language preference on VA profile

ALTER TABLE vas ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
