-- =====================================================================
-- BILANX — Migration 0008 : rendez-vous médicaux
--   * appointment_link (documents / résultats associés) n'avait pas de
--     profil ni de Row-Level Security : ajout du profil et de la RLS du
--     module « appointments » ; un lien ne peut viser qu'un élément du même
--     profil (vérifié par l'application et par la contrainte de profil).
--   * suppression logique et horodatages des rendez-vous.
-- =====================================================================
ALTER TABLE appointment
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN deleted_at timestamptz;
CREATE INDEX appointment_profile_idx ON appointment (profile_id, starts_at) WHERE deleted_at IS NULL;

ALTER TABLE appointment_link ADD COLUMN id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE appointment_link ADD COLUMN profile_id uuid REFERENCES profile(id) ON DELETE CASCADE;
UPDATE appointment_link l SET profile_id = a.profile_id FROM appointment a WHERE a.id = l.appointment_id;
ALTER TABLE appointment_link ALTER COLUMN profile_id SET NOT NULL;
CREATE UNIQUE INDEX appointment_link_doc ON appointment_link (appointment_id, document_id) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX appointment_link_lab ON appointment_link (appointment_id, lab_result_id) WHERE lab_result_id IS NOT NULL;

ALTER TABLE appointment_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_link FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_link_read ON appointment_link FOR SELECT USING (app_can_access_module(profile_id, 'appointments', false));
CREATE POLICY appointment_link_insert ON appointment_link FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'appointments', true));
CREATE POLICY appointment_link_delete ON appointment_link FOR DELETE USING (app_can_access_module(profile_id, 'appointments', true));
