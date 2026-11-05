-- =====================================================================
-- BILANX — Migration 0019 : unité d'affichage de la glycémie en g/L
--   Unité usuelle des comptes rendus de laboratoire en France (1,20 g/L).
--   Les valeurs restent stockées en mg/dL : seul l'affichage change.
-- =====================================================================
ALTER TABLE profile DROP CONSTRAINT profile_glucose_unit_check;
ALTER TABLE profile ADD CONSTRAINT profile_glucose_unit_check CHECK (glucose_unit IN ('mg/dL', 'mmol/L', 'g/L'));
