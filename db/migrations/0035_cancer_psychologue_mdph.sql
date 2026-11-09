-- =====================================================================
-- BILANX — Migration 0035 : dossiers « Cancer » (oncologie),
--   « Psychologue » et « MDPH » (handicap).
-- =====================================================================
ALTER TABLE document DROP CONSTRAINT IF EXISTS document_specialty_check;
ALTER TABLE document
  ADD CONSTRAINT document_specialty_check CHECK (specialty IS NULL OR specialty IN (
    'generaliste', 'cardiologie', 'dermatologie', 'endocrinologie', 'gastro', 'gynecologie', 'nephrologie', 'neurologie',
    'ophtalmologie', 'orl', 'pneumologie', 'rhumatologie', 'urologie', 'podologie', 'dentaire', 'psychiatrie', 'radiologie', 'autre',
    'vitamines', 'thrombose', 'cancer', 'psychologue', 'mdph'
  ));
