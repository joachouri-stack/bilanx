-- =====================================================================
-- BILANX — Migration 0027 : dossier d'un document
--   * facultatif : vitamines, mutuelle, attestation (liste fixe) ;
--   * sert aux raccourcis du tableau de bord et au filtre /documents?dossier=… ;
--   * mêmes droits que la table document (RLS inchangée).
-- =====================================================================
ALTER TABLE document
  ADD COLUMN folder text CHECK (folder IS NULL OR folder IN ('vitamines', 'mutuelle', 'attestation'));
CREATE INDEX IF NOT EXISTS document_profile_folder_idx ON document (profile_id, folder) WHERE deleted_at IS NULL;
