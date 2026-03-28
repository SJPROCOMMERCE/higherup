-- ─── fase-6.9-messages-ext.sql ──────────────────────────────────────────────
-- Attachment support for upload_messages + storage bucket

-- Attachment columns
ALTER TABLE upload_messages ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE upload_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE upload_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;
ALTER TABLE upload_messages ADD COLUMN IF NOT EXISTS attachment_size INTEGER;

-- Storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('messages', 'messages', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Allow messages upload"  ON storage.objects;
DROP POLICY IF EXISTS "Allow messages read"    ON storage.objects;
DROP POLICY IF EXISTS "Allow messages delete"  ON storage.objects;

CREATE POLICY "Allow messages upload"  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'messages');
CREATE POLICY "Allow messages read"    ON storage.objects FOR SELECT USING  (bucket_id = 'messages');
CREATE POLICY "Allow messages delete"  ON storage.objects FOR DELETE USING  (bucket_id = 'messages');
