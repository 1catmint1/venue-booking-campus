CREATE TABLE venue_sandboxes (sid TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, session_json TEXT NOT NULL, state_json TEXT NOT NULL, expires_ms INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE venue_demo_daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0);
