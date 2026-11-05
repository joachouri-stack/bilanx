-- =====================================================================
-- BILANX — Migration 0013 : journal d'audit vérifiable depuis une sauvegarde
--   Le hachage chaîné portait sur le contexte JSON dans l'ordre d'écriture ;
--   PostgreSQL (jsonb) réordonne les clés, le hachage n'était donc pas
--   recalculable pour un contexte à plusieurs clés. Nouvelles entrées :
--   format 2 (clés triées, recalculable). Les entrées existantes gardent le
--   format 1 (ajout de colonne sans réécriture : aucune ligne modifiée).
-- =====================================================================
ALTER TABLE audit_log ADD COLUMN hash_version smallint NOT NULL DEFAULT 1 CHECK (hash_version IN (1, 2));
