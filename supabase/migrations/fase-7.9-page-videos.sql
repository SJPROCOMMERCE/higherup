-- FASE 7.9: Page Videos — per-page video management

CREATE TABLE IF NOT EXISTS page_videos (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug   TEXT        NOT NULL UNIQUE,
  video_url   TEXT        NOT NULL DEFAULT '',
  is_active   BOOLEAN     NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pre-fill all VA dashboard pages
INSERT INTO page_videos (page_slug, video_url, is_active) VALUES
  ('dashboard',  '', false),
  ('clients',    '', false),
  ('upload',     '', false),
  ('uploads',    '', false),
  ('billing',    '', false),
  ('pricing',    '', false),
  ('affiliates', '', false),
  ('profile',    '', false),
  ('success',    '', false),
  ('messages',   '', false),
  ('waitlist',   '', false)
ON CONFLICT (page_slug) DO NOTHING;

-- RLS: readable by all (anon), writable by service role only
ALTER TABLE page_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_videos_read" ON page_videos
  FOR SELECT USING (true);
