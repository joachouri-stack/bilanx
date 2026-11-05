-- =====================================================================
-- BILANX — Migration 0024 : catégories de documents choisies à l'import
--   * « imagerie » (IRM, scanner, radiographie, échographie…) ;
--   * type d'examen d'imagerie ;
--   * catégorie fixée par l'utilisateur : la lecture automatique ne la change plus.
-- =====================================================================
ALTER TYPE document_kind ADD VALUE IF NOT EXISTS 'imaging';
ALTER TABLE document
  ADD COLUMN exam_type text CHECK (exam_type IS NULL OR exam_type IN ('irm', 'scanner', 'radio', 'echo', 'autre')),
  ADD COLUMN kind_by_user boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS document_profile_kind_idx ON document (profile_id, kind) WHERE deleted_at IS NULL;
