-- =====================================================================
-- BILANX — Migration 0034 : résultats qualitatifs (sérologies virales)
-- Un résultat peut porter la conclusion du laboratoire (positif / négatif / douteux),
-- seule ou avec une valeur chiffrée (index, titre). Sans valeur chiffrée, l'unité est une chaîne vide.
-- =====================================================================
ALTER TABLE lab_result
  ADD COLUMN qualitative text CHECK (qualitative IN ('positive', 'negative', 'equivocal')),
  ALTER COLUMN value DROP NOT NULL,
  ADD CONSTRAINT lab_result_value_or_qualitative CHECK (value IS NOT NULL OR qualitative IS NOT NULL),
  ADD CONSTRAINT lab_result_unit_with_value CHECK (value IS NULL OR unit <> '');
