-- ─── fase-9: VA Support Chat System ──────────────────────────────────────────
-- Tables: support_conversations, support_messages, support_canned_responses
-- Features: RLS, indexes, realtime, auto-update trigger

-- ─── 1. support_conversations ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_conversations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject                 TEXT NOT NULL,
  category                TEXT NOT NULL DEFAULT 'general',
  status                  TEXT NOT NULL DEFAULT 'open',
  priority                TEXT NOT NULL DEFAULT 'normal',
  admin_id                UUID REFERENCES auth.users(id),
  unread_admin            INTEGER NOT NULL DEFAULT 0,
  unread_va               INTEGER NOT NULL DEFAULT 0,
  last_message_at         TIMESTAMPTZ,
  last_message_preview    TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at             TIMESTAMPTZ,
  closed_at               TIMESTAMPTZ,
  auto_close_warning_sent BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_support_conv_va     ON support_conversations(va_id, status);
CREATE INDEX IF NOT EXISTS idx_support_conv_admin  ON support_conversations(admin_id, status);
CREATE INDEX IF NOT EXISTS idx_support_conv_status ON support_conversations(status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conv_unread ON support_conversations(unread_admin) WHERE unread_admin > 0;

-- ─── 2. support_messages ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES auth.users(id),
  sender_role      TEXT NOT NULL,
  message          TEXT NOT NULL,
  message_type     TEXT NOT NULL DEFAULT 'text',
  attachment_url   TEXT,
  attachment_name  TEXT,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_msg_conv   ON support_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_msg_unread ON support_messages(conversation_id, read_at) WHERE read_at IS NULL;

-- ─── 3. support_canned_responses ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_canned_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  category    TEXT,
  usage_count INTEGER DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 4. Realtime ──────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE support_conversations;

-- ─── 5. Auto-update trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_conversations SET
    last_message_at      = NEW.created_at,
    last_message_preview = LEFT(NEW.message, 100),
    updated_at           = now(),
    unread_admin = CASE
      WHEN NEW.sender_role = 'va' THEN unread_admin + 1
      ELSE unread_admin
    END,
    unread_va = CASE
      WHEN NEW.sender_role = 'admin' THEN unread_va + 1
      ELSE unread_va
    END,
    status = CASE
      WHEN NEW.message_type = 'system' THEN status
      WHEN NEW.sender_role = 'va'      THEN 'awaiting_admin'
      WHEN NEW.sender_role = 'admin'   THEN 'awaiting_va'
      ELSE status
    END
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_insert ON support_messages;
CREATE TRIGGER trg_message_insert
  AFTER INSERT ON support_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_on_message();

-- ─── 6. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_canned_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "va_own_conversations"   ON support_conversations;
DROP POLICY IF EXISTS "va_own_messages"        ON support_messages;
DROP POLICY IF EXISTS "admin_canned_responses" ON support_canned_responses;

CREATE POLICY "va_own_conversations" ON support_conversations
  FOR ALL USING (
    va_id = auth.uid()
    OR
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "va_own_messages" ON support_messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM support_conversations WHERE va_id = auth.uid()
    )
    OR
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_canned_responses" ON support_canned_responses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'admin')
  );
