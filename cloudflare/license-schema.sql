CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  issued_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS licenses_by_issue ON licenses (issued_at DESC);
