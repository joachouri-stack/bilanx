-- =====================================================================
-- BILANX — Migration 0025 : salle de sport (une séance = un jour coché)
--   * une ligne par profil et par jour : cocher deux fois ne crée pas de doublon ;
--   * mêmes droits que la rubrique Activité (lecture / écriture par rubrique) ;
--   * droits du rôle applicatif : privilèges par défaut de la migration 0012
--     (tables créées ensuite par le même compte de migration).
-- =====================================================================
CREATE TABLE gym_visit (
  profile_id uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  day        date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, day)
);

ALTER TABLE gym_visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_visit FORCE ROW LEVEL SECURITY;
CREATE POLICY gym_visit_read ON gym_visit FOR SELECT USING (app_can_access_module(profile_id, 'activity', false));
CREATE POLICY gym_visit_insert ON gym_visit FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'activity', true));
CREATE POLICY gym_visit_update ON gym_visit FOR UPDATE USING (app_can_access_module(profile_id, 'activity', true))
  WITH CHECK (app_can_access_module(profile_id, 'activity', true));
CREATE POLICY gym_visit_delete ON gym_visit FOR DELETE USING (app_can_access_module(profile_id, 'activity', true));

-- Filet de sécurité si les privilèges par défaut n'ont pas été posés par ce compte.
GRANT SELECT, INSERT, UPDATE, DELETE ON gym_visit TO bilanx_app;
