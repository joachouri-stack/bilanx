-- =====================================================================
-- BILANX — Migration 0030 : suivi du poids
--   * une valeur par profil et par jour (une nouvelle saisie le même jour la remplace) ;
--   * mêmes droits que la rubrique Activité (lecture / écriture par rubrique), comme la salle de sport.
-- =====================================================================
CREATE TABLE weight_entry (
  profile_id uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  day        date NOT NULL,
  weight_kg  numeric(5,1) NOT NULL CHECK (weight_kg BETWEEN 20 AND 350),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, day)
);

ALTER TABLE weight_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_entry FORCE ROW LEVEL SECURITY;
CREATE POLICY weight_entry_read ON weight_entry FOR SELECT USING (app_can_access_module(profile_id, 'activity', false));
CREATE POLICY weight_entry_insert ON weight_entry FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'activity', true));
CREATE POLICY weight_entry_update ON weight_entry FOR UPDATE USING (app_can_access_module(profile_id, 'activity', true))
  WITH CHECK (app_can_access_module(profile_id, 'activity', true));
CREATE POLICY weight_entry_delete ON weight_entry FOR DELETE USING (app_can_access_module(profile_id, 'activity', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON weight_entry TO bilanx_app;
