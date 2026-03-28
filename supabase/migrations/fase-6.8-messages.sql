-- ─── fase-6.8-messages.sql ───────────────────────────────────────────────────
-- Upload messages: inline chat between admin and VA per upload

-- upload_messages table
CREATE TABLE IF NOT EXISTS upload_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id    UUID        NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  sender_type  TEXT        NOT NULL CHECK (sender_type IN ('va', 'admin', 'system')),
  sender_id    UUID,
  sender_name  TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  is_read      BOOLEAN     DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upload_messages_upload ON upload_messages(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_messages_read   ON upload_messages(is_read) WHERE is_read = false;

ALTER TABLE upload_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on upload_messages" ON upload_messages;
CREATE POLICY "Allow all on upload_messages" ON upload_messages FOR ALL USING (true) WITH CHECK (true);

-- New tracking columns on uploads
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS has_unread_messages    BOOLEAN     DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS message_count          INTEGER     DEFAULT 0;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS last_message_at        TIMESTAMPTZ;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS awaiting_va_response   BOOLEAN     DEFAULT false;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS awaiting_admin_response BOOLEAN    DEFAULT false;
