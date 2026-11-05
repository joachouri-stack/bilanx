-- =====================================================================
-- BILANX — Migration 0017 : lecture des ordonnances
--   Traitements PROPOSÉS d'après une ordonnance déposée : brouillons tant que
--   l'utilisateur ne les a pas confirmés ligne par ligne (module Documents ;
--   la création du traitement passe ensuite par la RLS du module Médicaments).
-- =====================================================================
CREATE TABLE medication_draft (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES extraction_job(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  line_text     text NOT NULL,               -- ligne(s) lue(s) sur l'ordonnance
  line_index    int  NOT NULL,
  page          int,
  name          text NOT NULL,
  strength      text,
  posology      text NOT NULL DEFAULT '',
  times         text[] NOT NULL DEFAULT '{}',
  qty           text,
  start_date    date,
  end_date      date,
  confidence    numeric,
  checks        jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'confirmed', 'corrected', 'rejected')),
  medication_id uuid REFERENCES medication(id) ON DELETE SET NULL,
  reviewed_by   uuid REFERENCES account(id),
  reviewed_at   timestamptz
);
CREATE INDEX medication_draft_job_idx ON medication_draft (job_id, line_index);

ALTER TABLE medication_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_draft FORCE ROW LEVEL SECURITY;
CREATE POLICY medication_draft_read ON medication_draft FOR SELECT USING (app_can_access_module(profile_id, 'documents', false));
CREATE POLICY medication_draft_insert ON medication_draft FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'documents', true));
CREATE POLICY medication_draft_update ON medication_draft FOR UPDATE USING (app_can_access_module(profile_id, 'documents', true))
  WITH CHECK (app_can_access_module(profile_id, 'documents', true));
-- Droits du rôle applicatif : privilèges par défaut (migration 0012).
