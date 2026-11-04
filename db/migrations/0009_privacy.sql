-- =====================================================================
-- BILANX — Migration 0009 : droits RGPD (export, effacement)
--   * suppression du compte demandée → délai de grâce de 7 jours, puis
--     effacement des profils gérés et anonymisation du compte ;
--   * profil supprimé → invisible immédiatement, effacé après 30 jours.
-- Le journal d'audit (sans donnée de santé) est conservé selon la politique
-- de conservation ; il ne contient que des identifiants techniques.
-- =====================================================================
ALTER TABLE account
  ADD COLUMN deletion_requested_at timestamptz,
  ADD COLUMN deletion_scheduled_at timestamptz;
CREATE INDEX account_deletion_idx ON account (deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX profile_deleted_idx ON profile (deleted_at) WHERE deleted_at IS NOT NULL;
