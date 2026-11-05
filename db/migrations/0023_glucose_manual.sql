-- =====================================================================
-- BILANX — Migration 0023 : glycémie capillaire saisie à la main
--   Moment de la mesure (à jeun, avant / après un repas, coucher, nuit, autre). Valeurs toujours en mg/dL.
-- =====================================================================
ALTER TABLE glucose_reading ADD COLUMN context text
  CHECK (context IS NULL OR context IN ('fasting', 'before_meal', 'after_meal', 'bedtime', 'night', 'other'));
