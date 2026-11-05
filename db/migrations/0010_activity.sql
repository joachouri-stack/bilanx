-- =====================================================================
-- BILANX — Migration 0010 : activité et pas (import de l'export Apple Santé)
--   * une source par profil et par origine, avec la période couverte ;
--   * l'import est rejouable : les heures déjà présentes sont remplacées.
-- =====================================================================
ALTER TABLE activity_source
  ADD COLUMN data_from date,
  ADD COLUMN data_to   date,
  ADD COLUMN details   jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX activity_source_profile_type ON activity_source (profile_id, source_type);
CREATE INDEX activity_hourly_idx ON activity_hourly (profile_id, hour_start);
