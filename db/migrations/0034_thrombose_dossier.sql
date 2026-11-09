-- =====================================================================
-- BILANX — Migration 0034 : dossier thématique « Thrombose »
--   (phlébite, embolie, anticoagulants, médecine vasculaire).
-- =====================================================================
ALTER TABLE document DROP CONSTRAINT IF EXISTS document_specialty_check;
ALTER TABLE document
  ADD CONSTRAINT document_specialty_check CHECK (specialty IS NULL OR specialty IN (
    'generaliste', 'cardiologie', 'dermatologie', 'endocrinologie', 'gastro', 'gynecologie', 'nephrologie', 'neurologie',
    'ophtalmologie', 'orl', 'pneumologie', 'rhumatologie', 'urologie', 'podologie', 'dentaire', 'psychiatrie', 'radiologie', 'autre',
    'vitamines', 'thrombose'
  ));
