-- fase-8.6: Add the 4 instruction columns that exist in the admin form but not in the DB.
-- Without these, filling in "Title instructions" / "Description instructions" in the admin
-- prompt editor silently discards the content.

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS title_instructions       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description_instructions TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS seo_instructions         TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tags_instructions        TEXT DEFAULT NULL;

-- Populate the default template with solid base instructions so it produces output
-- even if the admin hasn't customised it yet.
-- Only updates rows where title_prompt is currently empty/null.
UPDATE prompts
SET
  title_prompt = 'Optimize this product title for SEO and Google Shopping. Structure: [Brand if present] + [Product Type] + [Key Feature] + [Material/Color/Size if relevant]. Use natural language that shoppers search for. Be specific and descriptive. Max 80 characters. No ALL CAPS. No unnecessary filler words.',
  description_prompt = 'Write a compelling, SEO-optimized product description. Include: what the product is, key features and benefits, material or specifications, and who it is for. Use short paragraphs (2-4 sentences each). Between 80 and 200 words. Professional e-commerce tone. If the input has HTML, preserve the structure. Do not add information not present in the original data.'
WHERE (title_prompt IS NULL OR title_prompt = '')
  AND (is_default = true OR is_active = true);
