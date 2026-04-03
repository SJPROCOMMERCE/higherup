-- fase-8.4: Add sku_structure to clients table

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS sku_structure TEXT DEFAULT NULL;
