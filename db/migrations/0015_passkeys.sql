-- =====================================================================
-- BILANX — Migration 0015 : clés d'accès (passkeys, WebAuthn)
--   * mfa_factor de type « webauthn » : identifiant de la clé (base64url),
--     clé publique chiffrée dans secret_enc, compteur de signatures (détection
--     de clé clonée), transports ;
--   * défis à usage unique (5 min) pour l'enregistrement et la connexion.
-- =====================================================================
ALTER TABLE mfa_factor
  ADD COLUMN credential_id text UNIQUE,
  ADD COLUMN sign_count    bigint NOT NULL DEFAULT 0,
  ADD COLUMN transports    text[],
  ADD CONSTRAINT mfa_factor_webauthn_id CHECK (kind <> 'webauthn' OR credential_id IS NOT NULL);

CREATE TABLE webauthn_challenge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid REFERENCES account(id) ON DELETE CASCADE,  -- NULL pour une connexion (compte inconnu à ce stade)
  purpose     text NOT NULL CHECK (purpose IN ('register', 'login')),
  challenge   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  CHECK (purpose = 'login' OR account_id IS NOT NULL)
);
CREATE INDEX webauthn_challenge_expiry_idx ON webauthn_challenge (expires_at);
-- Droits du rôle applicatif : hérités des privilèges par défaut (migration 0012).
