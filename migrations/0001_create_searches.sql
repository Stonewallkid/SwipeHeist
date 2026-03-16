-- Track search events
CREATE TABLE IF NOT EXISTS searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  town_name TEXT NOT NULL,
  state TEXT NOT NULL,
  searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient 30-day queries
CREATE INDEX IF NOT EXISTS idx_searches_date ON searches(searched_at);
