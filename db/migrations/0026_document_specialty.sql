-- =====================================================================
-- BILANX — Migration 0026 : spécialité médicale d'un document
--   * facultative (urologie, ophtalmologie, ORL…) : liste fixe de codes ;
--   * sert aux raccourcis du tableau de bord (Urologue, Ophtalmo, ORL) et
--     au filtre /documents?specialite=… ;
--   * mêmes droits que la table document (RLS inchangée).
-- =====================================================================
ALTER TABLE document
  ADD COLUMN specialty text CHECK (specialty IS NULL OR specialty IN (
    'generaliste', 'cardiologie', 'dermatologie', 'endocrinologie', 'gastro', 'gynecologie', 'nephrologie', 'neurologie',
    'ophtalmologie', 'orl', 'pneumologie', 'rhumatologie', 'urologie', 'podologie', 'dentaire', 'psychiatrie', 'radiologie', 'autre'
  ));
CREATE INDEX IF NOT EXISTS document_profile_specialty_idx ON document (profile_id, specialty) WHERE deleted_at IS NULL;
