-- =============================================================================
-- CATrack — Supabase / PostgreSQL Schema
-- =============================================================================
-- Idempotent: safe to run multiple times (CREATE TABLE IF NOT EXISTS).
-- Run via the Supabase SQL editor or psql.
--
-- Table overview:
--   users                    — inspector/operator identities
--   inspections              — one per inspection session
--   inspection_point_results — one per dot per inspection (status + notes)
--   inspection_photos        — one per photo taken at an inspection dot
--   photo_evaluations        — one per photo, written after Gemini completes
--   repair_recommendations   — snapshot of parts/repair suggestions per inspection
--
-- Future work noted inline:
--   • Swap users.id TEXT → UUID + foreign key to auth.users when OAuth lands
--   • Add RLS policies after auth is implemented
--   • Add Supabase Storage bucket "inspection-photos" via the dashboard
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM types (idempotent via DO block)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE inspection_status_enum AS ENUM ('in_progress', 'submitted', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE point_status_enum AS ENUM ('pending', 'good', 'monitor', 'action');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verdict_enum AS ENUM ('pass', 'fail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE severity_enum AS ENUM ('Critical', 'Major', 'Minor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE repair_status_enum AS ENUM ('monitor', 'action');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- Stores inspector/operator identities.
-- Currently the app uses a free-text ID entered at startup (AsyncStorage key
-- @hackillinois26_user_id). The id column uses TEXT to match that existing
-- value directly. When Google OAuth is added, migrate id to UUID and add a
-- foreign key to auth.users(id).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,            -- matches app's userId string
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  display_name TEXT,                        -- nullable until OAuth provides it
  email        TEXT                         -- nullable until OAuth provides it
);

COMMENT ON TABLE  users            IS 'Inspector/operator identities.';
COMMENT ON COLUMN users.id         IS 'Free-text ID entered at app startup. Migrate to UUID + auth.users FK when OAuth lands.';

-- ---------------------------------------------------------------------------
-- inspections
-- ---------------------------------------------------------------------------
-- One row per inspection session created via CreateInspectionFormScreen.
-- The app already inserts into this table via:
--   supabase.from("inspections").insert({ user_id, inspection_type,
--     asset_name, serial_number, location, assignment_notes, app_id })
-- This schema adds the missing columns (vehicle_model, status, timestamps).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inspections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at     TIMESTAMPTZ,                          -- set when status → submitted

  -- matches the existing insert payload from the app
  app_id           TEXT NOT NULL UNIQUE,                 -- 8-digit client-generated id
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  -- vehicle / asset
  vehicle_model    TEXT NOT NULL DEFAULT 'CAT_982M',     -- future multi-vehicle support
  asset_name       TEXT NOT NULL DEFAULT 'FAMILY-ALL',
  serial_number    TEXT,

  -- inspection metadata
  inspection_type  TEXT NOT NULL DEFAULT 'Daily'
                     CHECK (inspection_type IN ('Daily', 'Pre-shift', 'Weekly')),
  location         TEXT NOT NULL DEFAULT 'No location specified',
  assignment_notes TEXT NOT NULL DEFAULT '',

  -- lifecycle
  status           inspection_status_enum NOT NULL DEFAULT 'in_progress'
);

-- If the table already existed (from an earlier app insert), backfill any missing columns.
-- These are safe no-ops when the column already exists.
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS submitted_at    TIMESTAMPTZ;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS vehicle_model   TEXT NOT NULL DEFAULT 'CAT_982M';
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS asset_name      TEXT NOT NULL DEFAULT 'FAMILY-ALL';
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS serial_number   TEXT;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS inspection_type TEXT NOT NULL DEFAULT 'Daily';
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS location        TEXT NOT NULL DEFAULT 'No location specified';
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS assignment_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS status          inspection_status_enum NOT NULL DEFAULT 'in_progress';

COMMENT ON TABLE  inspections               IS 'One row per inspection session.';
COMMENT ON COLUMN inspections.app_id        IS 'Client-generated 8-digit ID used for local lookups before UUID is known.';
COMMENT ON COLUMN inspections.vehicle_model IS 'CAT model identifier. Currently always CAT_982M.';

CREATE INDEX IF NOT EXISTS idx_inspections_user    ON inspections (user_id);
CREATE INDEX IF NOT EXISTS idx_inspections_status  ON inspections (status);
CREATE INDEX IF NOT EXISTS idx_inspections_created ON inspections (created_at DESC);

-- Automatically bump updated_at on every row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inspections_updated_at ON inspections;
CREATE TRIGGER trg_inspections_updated_at
  BEFORE UPDATE ON inspections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- inspection_point_results
-- ---------------------------------------------------------------------------
-- One row per inspection dot per inspection session.
-- Maps directly to InspectionContext state: { status, notes } keyed by point_id.
-- point_id values are the string keys defined in data/inspectionData.js
-- (e.g. 'front_left_wheel', 'engine_cooling_hoses').
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inspection_point_results (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  inspection_id  UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

  -- matches inspectionData.js point fields
  point_id       TEXT NOT NULL,   -- e.g. 'front_left_wheel'
  point_label    TEXT NOT NULL,   -- e.g. 'Front Left Wheel'
  perspective_id TEXT NOT NULL,   -- e.g. 'front', 'engine_left'
  image_type     TEXT NOT NULL,   -- e.g. 'tires_rims', 'hydraulic', 'structural'

  -- inspection outcome
  status         point_status_enum NOT NULL DEFAULT 'pending',
  notes          TEXT NOT NULL DEFAULT '',   -- user-editable; pre-filled from AI description

  CONSTRAINT uq_point_per_inspection UNIQUE (inspection_id, point_id)
);

COMMENT ON TABLE  inspection_point_results          IS 'One row per inspection dot per session. Mirrors InspectionContext state.';
COMMENT ON COLUMN inspection_point_results.point_id IS 'String key from data/inspectionData.js (e.g. front_left_wheel).';
COMMENT ON COLUMN inspection_point_results.notes    IS 'User-editable field; auto-populated from Gemini description when blank.';

CREATE INDEX IF NOT EXISTS idx_ipr_inspection ON inspection_point_results (inspection_id);
CREATE INDEX IF NOT EXISTS idx_ipr_status     ON inspection_point_results (inspection_id, status);

DROP TRIGGER IF EXISTS trg_ipr_updated_at ON inspection_point_results;
CREATE TRIGGER trg_ipr_updated_at
  BEFORE UPDATE ON inspection_point_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- inspection_photos
-- ---------------------------------------------------------------------------
-- One row per photo captured/selected via PhotoCaptureScreen.
-- client_photo_id is the 'photo_<timestamp>_<random>' string generated in the app.
-- storage_path will be populated once the photo is uploaded to Supabase Storage
-- (bucket: inspection-photos). The local URI is only valid on-device.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inspection_photos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- link back to the inspection and specific dot
  inspection_id    UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  point_id         TEXT NOT NULL,   -- denormalised for fast lookup without joining ipr

  -- client-side identity (matches context photo.id)
  client_photo_id  TEXT NOT NULL UNIQUE,   -- 'photo_<ts>_<rand>'

  -- storage
  storage_path     TEXT,            -- path in Supabase Storage bucket 'inspection-photos'
                                    -- NULL until upload completes
  -- processing state
  processing       BOOLEAN NOT NULL DEFAULT TRUE  -- TRUE while Gemini evaluation is running
);

COMMENT ON TABLE  inspection_photos                  IS 'One row per photo taken at an inspection dot.';
COMMENT ON COLUMN inspection_photos.client_photo_id  IS 'Client-generated id (photo_<ts>_<rand>). Used to correlate context state with DB row.';
COMMENT ON COLUMN inspection_photos.storage_path     IS 'Path in Supabase Storage bucket inspection-photos. NULL until upload completes.';
COMMENT ON COLUMN inspection_photos.processing       IS 'TRUE while Gemini evaluation is in progress. Set to FALSE by photo_evaluations insert trigger.';

CREATE INDEX IF NOT EXISTS idx_photos_inspection ON inspection_photos (inspection_id);
CREATE INDEX IF NOT EXISTS idx_photos_point      ON inspection_photos (inspection_id, point_id);

-- ---------------------------------------------------------------------------
-- photo_evaluations
-- ---------------------------------------------------------------------------
-- One row per photo, written once Gemini completes all 3 runs.
-- One-to-one with inspection_photos (enforced by UNIQUE on photo_id).
--
-- raw_runs  — JSONB array of the 3 raw Gemini responses, preserved for audit
--             and future re-analysis without re-calling the API.
--             Shape: [{ verdict, description, issues: [{description, severity, box_2d}] }]
--
-- issues    — JSONB array of merged + deduped bboxes, normalised to 0-1 fractions.
--             Shape: [{ description, severity, bbox: {x, y, width, height} }]
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS photo_evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  photo_id         UUID NOT NULL UNIQUE REFERENCES inspection_photos(id) ON DELETE CASCADE,

  -- model used
  model            TEXT NOT NULL DEFAULT 'gemini-3-pro-preview',

  -- consensus result
  verdict          verdict_enum NOT NULL,
  description      TEXT,                        -- Gemini's 1-2 sentence summary
  auto_status      point_status_enum,           -- derived status: good/monitor/action

  -- raw per-run data (for audit + re-analysis)
  raw_runs         JSONB NOT NULL DEFAULT '[]', -- array of up to 3 raw Gemini responses
  issues           JSONB NOT NULL DEFAULT '[]', -- merged/deduped bbox issues

  -- confidence indicators
  runs_succeeded   SMALLINT NOT NULL DEFAULT 0 CHECK (runs_succeeded BETWEEN 0 AND 3),
  runs_attempted   SMALLINT NOT NULL DEFAULT 3 CHECK (runs_attempted BETWEEN 1 AND 3)
);

COMMENT ON TABLE  photo_evaluations            IS 'Gemini evaluation result for one inspection photo. One-to-one with inspection_photos.';
COMMENT ON COLUMN photo_evaluations.raw_runs   IS 'All raw Gemini responses [{verdict,description,issues[{description,severity,box_2d}]}]. Preserved for audit.';
COMMENT ON COLUMN photo_evaluations.issues     IS 'Merged+deduped bboxes [{description,severity,bbox:{x,y,width,height}}]. Used for rendering overlays.';
COMMENT ON COLUMN photo_evaluations.auto_status IS 'Derived from highest-severity issue: Critical/Major→action, Minor→monitor, no issues→good.';

CREATE INDEX IF NOT EXISTS idx_eval_photo ON photo_evaluations (photo_id);

-- When an evaluation is inserted, flip processing=false on the parent photo
CREATE OR REPLACE FUNCTION mark_photo_processed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inspection_photos SET processing = FALSE WHERE id = NEW.photo_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eval_mark_processed ON photo_evaluations;
CREATE TRIGGER trg_eval_mark_processed
  AFTER INSERT ON photo_evaluations
  FOR EACH ROW EXECUTE FUNCTION mark_photo_processed();

-- ---------------------------------------------------------------------------
-- repair_recommendations
-- ---------------------------------------------------------------------------
-- Snapshot of the repair/parts suggestions shown in the slide-up panel for an
-- inspection. One row per flagged inspection point per inspection.
-- Populated by the parts suggestion API (currently stubbed in lib/partsApi.js).
-- Storing a snapshot means the repair list is stable even if part prices change.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS repair_recommendations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  inspection_id  UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  point_id       TEXT NOT NULL,   -- inspection dot that triggered this recommendation

  -- part / repair details (snapshot from partsApi at time of inspection)
  part_number    TEXT NOT NULL DEFAULT 'CONTACT-DEALER',
  part_name      TEXT NOT NULL,
  price          NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  purchase_url   TEXT,
  repair_note    TEXT NOT NULL DEFAULT '',

  -- severity status of the originating inspection dot
  status         repair_status_enum NOT NULL,

  CONSTRAINT uq_repair_per_point UNIQUE (inspection_id, point_id)
);

COMMENT ON TABLE  repair_recommendations           IS 'Snapshot of parts/repair suggestions per inspection. One row per flagged dot.';
COMMENT ON COLUMN repair_recommendations.price     IS 'Price at time of inspection snapshot. Not updated if catalogue price changes.';
COMMENT ON COLUMN repair_recommendations.status    IS 'monitor or action — mirrors the inspection dot status that triggered this recommendation.';

CREATE INDEX IF NOT EXISTS idx_repairs_inspection ON repair_recommendations (inspection_id);
CREATE INDEX IF NOT EXISTS idx_repairs_status     ON repair_recommendations (inspection_id, status);

-- ---------------------------------------------------------------------------
-- Helpful views
-- ---------------------------------------------------------------------------

-- Summary of an inspection: total dots, counts by status, estimated repair total
CREATE OR REPLACE VIEW inspection_summary AS
SELECT
  i.id                                                              AS inspection_id,
  i.app_id,
  i.user_id,
  i.vehicle_model,
  i.asset_name,
  i.serial_number,
  i.inspection_type,
  i.location,
  i.status                                                          AS inspection_status,
  i.created_at,
  i.updated_at,
  i.submitted_at,
  COUNT(ipr.id)                                                     AS total_points,
  COUNT(ipr.id) FILTER (WHERE ipr.status = 'pending')              AS pending_count,
  COUNT(ipr.id) FILTER (WHERE ipr.status = 'good')                 AS good_count,
  COUNT(ipr.id) FILTER (WHERE ipr.status = 'monitor')              AS monitor_count,
  COUNT(ipr.id) FILTER (WHERE ipr.status = 'action')               AS action_count,
  COALESCE(SUM(rr.price), 0)                                       AS estimated_repair_total
FROM inspections i
LEFT JOIN inspection_point_results ipr ON ipr.inspection_id = i.id
LEFT JOIN repair_recommendations   rr  ON rr.inspection_id  = i.id
GROUP BY i.id;

COMMENT ON VIEW inspection_summary IS 'Per-inspection rollup: dot counts by status + total estimated repair cost.';

-- Full detail view for a single inspection: dots + photos + evaluations
CREATE OR REPLACE VIEW inspection_detail AS
SELECT
  ipr.inspection_id,
  ipr.point_id,
  ipr.point_label,
  ipr.perspective_id,
  ipr.image_type,
  ipr.status                    AS point_status,
  ipr.notes,
  ip.id                         AS photo_id,
  ip.client_photo_id,
  ip.storage_path,
  ip.processing,
  ip.captured_at,
  pe.verdict,
  pe.description                AS ai_description,
  pe.auto_status,
  pe.issues                     AS bboxes,
  pe.runs_succeeded,
  pe.model
FROM inspection_point_results ipr
LEFT JOIN inspection_photos    ip  ON ip.inspection_id = ipr.inspection_id
                                  AND ip.point_id      = ipr.point_id
LEFT JOIN photo_evaluations    pe  ON pe.photo_id      = ip.id;

COMMENT ON VIEW inspection_detail IS 'Full drill-down: every dot with its photos and AI evaluations for a given inspection.';
