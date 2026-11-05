-- =====================================================================
-- BILANX — Migration 0020 : « Rester connecté sur cet appareil »
--   Choix fait à la connexion. Une session mémorisée expire après 90 jours sans utilisation
--   et au plus tard un an après la connexion (au lieu de 30 min / 12 h).
-- =====================================================================
ALTER TABLE session ADD COLUMN remember boolean NOT NULL DEFAULT false;
