-- FASE 8.1: Leaderboard cache — for future real data

CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  va_id         UUID        NOT NULL REFERENCES vas(id) ON DELETE CASCADE,
  rank          INTEGER     NOT NULL,
  total_earned  DECIMAL     DEFAULT 0,
  client_count  INTEGER     DEFAULT 0,
  period        TEXT        NOT NULL DEFAULT 'last_30_days',
  is_fake       BOOLEAN     DEFAULT false,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(va_id, period)
);

ALTER TABLE leaderboard_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on leaderboard_cache" ON leaderboard_cache FOR ALL USING (true) WITH CHECK (true);
