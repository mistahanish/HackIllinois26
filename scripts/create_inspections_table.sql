-- Inspections table for HackIllinois26
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New query
-- user_id: manually entered for now; later use uuid from Google OAuth
-- app_id: numeric id used by the app for display/navigation

CREATE TABLE IF NOT EXISTS inspections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  inspection_type TEXT NOT NULL,
  asset_name      TEXT NOT NULL,
  serial_number   TEXT,
  location        TEXT NOT NULL,
  assignment_notes TEXT,
  app_id          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional, for multi-tenant)
-- ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Users can insert own inspections"
--   ON inspections FOR INSERT
--   WITH CHECK (auth.uid()::text = user_id OR true);
-- (Adjust policy when adding Supabase Auth.)
