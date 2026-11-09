-- =====================================================================
-- BILANX — Migration 0039 : contacts des professionnels de santé
--   * carnet d'adresses par profil (médecins, kiné, laboratoire…) :
--     nom, prénom, spécialité, téléphone, e-mail, adresse, notes ;
--   * mêmes droits que la rubrique Rendez-vous (module « appointments ») ;
--   * suppression logique, comme les rendez-vous.
-- =====================================================================
CREATE TABLE health_contact (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  first_name  text CHECK (char_length(first_name) <= 80),
  last_name   text CHECK (char_length(last_name) <= 80),
  specialty   text CHECK (char_length(specialty) <= 80),
  phone       text CHECK (char_length(phone) <= 30),
  email       text CHECK (char_length(email) <= 254),
  address     text CHECK (char_length(address) <= 300),
  notes       text CHECK (char_length(notes) <= 1000),
  created_by  uuid NOT NULL REFERENCES account(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  deleted_at  timestamptz,
  CHECK (num_nonnulls(first_name, last_name) >= 1)
);
CREATE INDEX health_contact_profile_idx ON health_contact (profile_id, last_name, first_name) WHERE deleted_at IS NULL;

ALTER TABLE health_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_contact FORCE ROW LEVEL SECURITY;
CREATE POLICY health_contact_read ON health_contact FOR SELECT USING (app_can_access_module(profile_id, 'appointments', false));
CREATE POLICY health_contact_insert ON health_contact FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'appointments', true));
CREATE POLICY health_contact_update ON health_contact FOR UPDATE USING (app_can_access_module(profile_id, 'appointments', true))
  WITH CHECK (app_can_access_module(profile_id, 'appointments', true));
CREATE POLICY health_contact_delete ON health_contact FOR DELETE USING (app_can_access_module(profile_id, 'appointments', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON health_contact TO bilanx_app;
