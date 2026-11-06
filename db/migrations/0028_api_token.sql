-- =====================================================================
-- BILANX — Migration 0028 : clés d'envoi automatique (Raccourcis iPhone)
--   * une clé = un compte + un profil + un usage (« steps » : envoyer les pas) ;
--   * seule l'empreinte SHA-256 est conservée (la clé n'est montrée qu'une fois) ;
--   * révocable ; date de dernière utilisation affichée à l'utilisateur ;
--   * à chaque envoi, les droits du compte sur le profil sont revérifiés (RLS inchangée).
--   Nouvelle origine d'activité « ios_shortcut ».
-- =====================================================================
ALTER TYPE data_source_type ADD VALUE IF NOT EXISTS 'ios_shortcut';

CREATE TABLE api_token (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  scope         text NOT NULL CHECK (scope IN ('steps')),
  label         text NOT NULL,
  token_hash    bytea NOT NULL UNIQUE,
  hint          text NOT NULL,            -- 4 derniers caractères, pour reconnaître la clé
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX api_token_account_idx ON api_token (account_id, profile_id) WHERE revoked_at IS NULL;
