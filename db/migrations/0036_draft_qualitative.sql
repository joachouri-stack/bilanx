-- =====================================================================
-- BILANX — Migration 0036 : conclusion lue dans les bilans (sérologies)
-- « Négatif », « Non réactif »… relevés par le lecteur de bilans, à valider comme les valeurs.
-- raw_value vaut '' quand la ligne ne porte que la conclusion.
-- =====================================================================
ALTER TABLE extracted_value_draft
  ADD COLUMN raw_qualitative text,
  ADD COLUMN parsed_qualitative text CHECK (parsed_qualitative IN ('positive', 'negative', 'equivocal'));
