-- =====================================================================
-- BILANX — Migration 0021 : double authentification facultative
--   Choix explicite de l'utilisateur (« Continuer sans double authentification ») ; il peut l'activer
--   plus tard dans Paramètres, ce qui efface ce choix.
-- =====================================================================
ALTER TABLE account ADD COLUMN mfa_opted_out_at timestamptz;
