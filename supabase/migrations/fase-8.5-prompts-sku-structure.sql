-- fase-8.5: Add sku_structure to prompts table + set default

ALTER TABLE prompts
  ADD COLUMN IF NOT EXISTS sku_structure TEXT DEFAULT NULL;

-- Every existing template defaults to title-size-color
UPDATE prompts
SET sku_structure = 'title-size-color'
WHERE sku_structure IS NULL OR sku_structure = '';
