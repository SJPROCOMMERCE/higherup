-- FASE 8.0: Success Progress — track which sections the VA has visited

CREATE TABLE IF NOT EXISTS success_progress (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id            UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  section_slug     TEXT        NOT NULL,
  completed        BOOLEAN     DEFAULT false,
  last_visited_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(va_id, section_slug)
);

ALTER TABLE success_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on success_progress" ON success_progress FOR ALL USING (true) WITH CHECK (true);
