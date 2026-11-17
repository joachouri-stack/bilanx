-- =====================================================================
-- BILANX — Migration 0040 : suivis réguliers (rendez-vous à prendre)
--   * care_plan : un suivi par profil (détartrage 1 fois par an, prise de
--     sang HbA1c tous les 3 mois, pied chaque année en juillet…) :
--     fréquence en mois OU mois fixe, délai de rappel, dernier passage
--     connu, analyse liée (la dernière HbA1c saisie vaut passage) ;
--   * appointment.care_plan_id : le rendez-vous pris pour ce suivi ;
--     une fois passé, il compte comme dernier passage ;
--   * care_plan_notified : une seule notification par échéance et par
--     compte (même logique que reminder_sent) ;
--   * mêmes droits que la rubrique Rendez-vous (module « appointments »).
-- =====================================================================
CREATE TABLE care_plan (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  label         text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  icon          text NOT NULL DEFAULT 'calendar' CHECK (char_length(icon) <= 30),
  specialty     text CHECK (char_length(specialty) <= 80),       -- pour retrouver le contact du carnet
  every_months  int CHECK (every_months BETWEEN 1 AND 60),
  fixed_month   int CHECK (fixed_month BETWEEN 1 AND 12),
  remind_days   int NOT NULL DEFAULT 30 CHECK (remind_days BETWEEN 0 AND 180),
  last_done     date,
  lab_analyte   text CHECK (char_length(lab_analyte) <= 40),
  created_by    uuid NOT NULL REFERENCES account(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  deleted_at    timestamptz,
  CHECK (num_nonnulls(every_months, fixed_month) = 1)
);
CREATE INDEX care_plan_profile_idx ON care_plan (profile_id) WHERE deleted_at IS NULL;

ALTER TABLE care_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan FORCE ROW LEVEL SECURITY;
CREATE POLICY care_plan_read ON care_plan FOR SELECT USING (app_can_access_module(profile_id, 'appointments', false));
CREATE POLICY care_plan_insert ON care_plan FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'appointments', true));
CREATE POLICY care_plan_update ON care_plan FOR UPDATE USING (app_can_access_module(profile_id, 'appointments', true))
  WITH CHECK (app_can_access_module(profile_id, 'appointments', true));
CREATE POLICY care_plan_delete ON care_plan FOR DELETE USING (app_can_access_module(profile_id, 'appointments', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON care_plan TO bilanx_app;

ALTER TABLE appointment ADD COLUMN care_plan_id uuid REFERENCES care_plan(id) ON DELETE SET NULL;
CREATE INDEX appointment_care_plan_idx ON appointment (care_plan_id) WHERE care_plan_id IS NOT NULL;

CREATE TABLE care_plan_notified (
  care_plan_id uuid NOT NULL REFERENCES care_plan(id) ON DELETE CASCADE,
  due_on       date NOT NULL,
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (care_plan_id, due_on, account_id)
);
GRANT SELECT, INSERT, DELETE ON care_plan_notified TO bilanx_app;
