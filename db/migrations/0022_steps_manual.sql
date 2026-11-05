-- =====================================================================
-- BILANX — Migration 0022 : saisie manuelle du nombre de pas par jour
--   Source « Saisie manuelle » (une par profil), statut dédié. Un jour saisi n'a pas de détail horaire.
-- =====================================================================
ALTER TABLE activity_source DROP CONSTRAINT activity_source_status_check;
ALTER TABLE activity_source ADD CONSTRAINT activity_source_status_check
  CHECK (status IN ('not_connected', 'file_import', 'manual', 'active', 'error', 'revoked'));
