-- =====================================================================
-- BILANX — Migration 0033 : « Vitamines » devient un dossier thématique
--   * comme Yeux ou Diabète (colonne specialty) : une ordonnance de vitamines
--     est une « Ordonnance » rangée dans le dossier « Vitamines » ;
--   * les documents du dossier administratif « vitamines » y sont déplacés
--     (la valeur reste acceptée dans document.folder pour compatibilité).
-- =====================================================================
ALTER TABLE document DROP CONSTRAINT IF EXISTS document_specialty_check;
ALTER TABLE document
  ADD CONSTRAINT document_specialty_check CHECK (specialty IS NULL OR specialty IN (
    'generaliste', 'cardiologie', 'dermatologie', 'endocrinologie', 'gastro', 'gynecologie', 'nephrologie', 'neurologie',
    'ophtalmologie', 'orl', 'pneumologie', 'rhumatologie', 'urologie', 'podologie', 'dentaire', 'psychiatrie', 'radiologie', 'autre',
    'vitamines'
  ));
UPDATE document SET specialty = COALESCE(specialty, 'vitamines'), folder = NULL WHERE folder = 'vitamines';
