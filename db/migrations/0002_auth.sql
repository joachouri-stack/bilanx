-- =====================================================================
-- BILANX — Migration 0002 : authentification sécurisée
--   * jetons à usage unique (vérification e-mail, réinitialisation)
--   * limitation des tentatives (connexion, MFA, demandes de réinitialisation)
--   * TOTP : confirmation de l'enrôlement et anti-rejeu
--   * codes de secours hachés
--   * sessions : expiration glissante + absolue, étape MFA
-- =====================================================================

ALTER TABLE account
  ADD COLUMN password_changed_at timestamptz;

ALTER TABLE mfa_factor
  ADD COLUMN confirmed_at   timestamptz,          -- NULL tant que l'enrôlement n'est pas validé par un code
  ADD COLUMN last_used_step bigint;               -- dernier pas TOTP accepté (anti-rejeu)
CREATE INDEX mfa_factor_account_idx ON mfa_factor (account_id);

ALTER TABLE session
  ADD COLUMN last_seen_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN absolute_expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours',
  ADD COLUMN mfa_passed_at       timestamptz;
CREATE INDEX session_account_idx ON session (account_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  purpose     text NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
  token_hash  bytea NOT NULL UNIQUE,              -- SHA-256 du jeton ; le jeton lui-même n'est jamais stocké
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_token_account_idx ON auth_token (account_id, purpose);

CREATE TABLE auth_throttle (
  id           bigserial PRIMARY KEY,
  key_hash     bytea NOT NULL,                    -- SHA-256 de « portée:identifiant » (pas d'e-mail en clair)
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_throttle_key_idx ON auth_throttle (key_hash, attempted_at DESC);

CREATE TABLE mfa_recovery_code (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  code_hash   bytea NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_code_account_idx ON mfa_recovery_code (account_id) WHERE used_at IS NULL;
