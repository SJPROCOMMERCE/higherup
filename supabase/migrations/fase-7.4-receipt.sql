-- FASE 7.4: VA Rate per Product (for receipt widget)

ALTER TABLE clients ADD COLUMN IF NOT EXISTS va_rate_per_product DECIMAL;

COMMENT ON COLUMN clients.va_rate_per_product IS 'What the VA charges their client per product row (e.g. 0.65). Used for the receipt earnings widget. Not stored on the invoice, VA sets this themselves.';
