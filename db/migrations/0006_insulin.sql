-- =====================================================================
-- BILANX — Migration 0006 : module insuline
--   * suppression logique des injections et des modifications de traitement
--     (historique conservé, invisible pour l'utilisateur, journalisé) ;
--   * nom d'insuline unique (actif) par profil.
-- Rappel : BILANX n'enregistre que des doses DÉCLARÉES et des modifications
-- PRESCRITES ; aucune dose n'est calculée ni suggérée.
-- =====================================================================
ALTER TABLE insulin_dose ADD COLUMN deleted_at timestamptz;
ALTER TABLE treatment_change ADD COLUMN deleted_at timestamptz;
ALTER TABLE insulin_product ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX insulin_product_name_active ON insulin_product (profile_id, lower(name)) WHERE active;
CREATE INDEX treatment_change_idx ON treatment_change (profile_id, effective_date DESC) WHERE deleted_at IS NULL;
