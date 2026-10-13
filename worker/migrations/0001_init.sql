-- Label Drop API: initial schema (SPEC 9.5).

CREATE TABLE problems (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL CHECK (source IN ('template', 'ai')),
  difficulty   TEXT NOT NULL,
  domain       TEXT,
  scheme       TEXT,
  body         TEXT NOT NULL,                    -- Problem JSON
  items_hash   TEXT UNIQUE,                      -- duplicate guard
  qa_cohesion  REAL,
  status       TEXT NOT NULL DEFAULT 'ready',    -- ready | rejected | retired
  play_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_problems_pick ON problems(status, difficulty, play_count);

-- Shared daily AI budget (UTC day; Workers AI resets at 00:00 UTC = 09:00 JST).
CREATE TABLE ai_budget (
  day        TEXT PRIMARY KEY,                   -- 'YYYY-MM-DD' (UTC)
  cap        REAL NOT NULL,
  used       REAL NOT NULL DEFAULT 0,            -- settled + reserved
  exhausted  INTEGER NOT NULL DEFAULT 0
);

-- Signed-in players (AUTH_MODE=access). Anonymous players (AUTH_MODE=none) are not stored here.
CREATE TABLE users (
  id           TEXT PRIMARY KEY,                 -- random id (never the email)
  email        TEXT NOT NULL UNIQUE,
  name         TEXT,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

-- Every AI call: audit, calibration and per-user daily quotas.
CREATE TABLE ai_calls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  day         TEXT NOT NULL,
  kind        TEXT NOT NULL,                     -- gen | eval | embed
  model       TEXT NOT NULL,
  tokens_in   INTEGER,
  tokens_out  INTEGER,
  neurons     REAL,
  ok          INTEGER NOT NULL,
  error       TEXT,
  user_id     TEXT,                              -- NULL for the cron pre-generation
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_ai_calls_quota ON ai_calls(user_id, day, kind);

-- Play history (skill trend, and later "everyone's labels").
CREATE TABLE plays (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  problem_id      TEXT NOT NULL,
  mode            TEXT,
  submission      TEXT NOT NULL,
  score_total     REAL,
  score_structure REAL,
  score_labeling  REAL,
  engine          TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_plays_user ON plays(user_id, created_at);
