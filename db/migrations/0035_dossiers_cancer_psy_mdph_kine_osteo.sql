-- =====================================================================
-- BILANX — Migration 0035 : dossiers « Cancer » (oncologie), « Psychologue »,
--   « MDPH » (handicap), « Kiné » (kinésithérapie) et « Ostéopathe ».
-- =====================================================================
ALTER TABLE document DROP CONSTRAINT IF EXISTS document_specialty_check;
ALTER TABLE document
  ADD CONSTRAINT document_specialty_check CHECK (specialty IS NULL OR specialty IN (
    'generaliste', 'cardiologie', 'dermatologie', 'endocrinologie', 'gastro', 'gynecologie', 'nephrologie', 'neurologie',
    'ophtalmologie', 'orl', 'pneumologie', 'rhumatologie', 'urologie', 'podologie', 'dentaire', 'psychiatrie', 'radiologie', 'autre',
    'vitamines', 'thrombose', 'cancer', 'psychologue', 'mdph', 'kine', 'osteopathe'
  ));
