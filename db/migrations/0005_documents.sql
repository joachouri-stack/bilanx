-- =====================================================================
-- BILANX — Migration 0005 : documents chiffrés et lecture des bilans
--
--   * document_file : pages/fichiers originaux, CHIFFRÉS (AES-256-GCM) avec la
--     clé propre au document (document.dek_enc, elle-même chiffrée par la clé
--     maîtresse). Stockés en base pour le MVP ; stockage objet HDS ensuite.
--   * extraction_job / extracted_value_draft : profil + RLS « documents ».
--     Une valeur détectée reste un BROUILLON jusqu'à la validation humaine.
-- =====================================================================

CREATE TABLE document_file (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  page        int  NOT NULL CHECK (page >= 1),
  mime_type   text NOT NULL,
  size_bytes  int  NOT NULL,
  sha256      bytea NOT NULL,
  data_enc    bytea NOT NULL,
  UNIQUE (document_id, page)
);
ALTER TABLE document_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_file FORCE ROW LEVEL SECURITY;
CREATE POLICY document_file_read ON document_file FOR SELECT USING (app_can_access_module(profile_id, 'documents', false));
CREATE POLICY document_file_insert ON document_file FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'documents', true));
CREATE POLICY document_file_delete ON document_file FOR DELETE USING (app_can_access_module(profile_id, 'documents', true));

ALTER TABLE extraction_job
  ADD COLUMN profile_id uuid REFERENCES profile(id) ON DELETE CASCADE,
  ADD COLUMN method     text CHECK (method IN ('pdf_text', 'ocr')),
  ADD COLUMN reviewed_by uuid REFERENCES account(id),
  ADD COLUMN reviewed_at timestamptz;
UPDATE extraction_job j SET profile_id = d.profile_id FROM document d WHERE d.id = j.document_id;
ALTER TABLE extraction_job ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE extraction_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_job FORCE ROW LEVEL SECURITY;
CREATE POLICY extraction_job_read ON extraction_job FOR SELECT USING (app_can_access_module(profile_id, 'documents', false));
CREATE POLICY extraction_job_insert ON extraction_job FOR INSERT WITH CHECK (app_can_access_module(profile_id, 'documents', true));
CREATE POLICY extraction_job_update ON extraction_job FOR UPDATE USING (app_can_access_module(profile_id, 'documents', true))
  WITH CHECK (app_can_access_module(profile_id, 'documents', true));

ALTER TABLE extracted_value_draft
  ADD COLUMN line_text     text,               -- ligne lue dans le document (montrée à l'utilisateur)
  ADD COLUMN line_index    int,
  ADD COLUMN lab_result_id uuid REFERENCES lab_result(id) ON DELETE SET NULL;

CREATE INDEX document_profile_idx ON document (profile_id, uploaded_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX extraction_job_document_idx ON extraction_job (document_id);
CREATE INDEX extracted_value_draft_job_idx ON extracted_value_draft (job_id);
