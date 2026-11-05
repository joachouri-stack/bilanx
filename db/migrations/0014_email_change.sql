-- =====================================================================
-- BILANX — Migration 0014 : changement d'adresse e-mail
--   Jeton « email_change » envoyé à la NOUVELLE adresse ; l'adresse visée
--   est conservée avec le jeton et n'est appliquée qu'à sa confirmation.
-- =====================================================================
ALTER TABLE auth_token DROP CONSTRAINT auth_token_purpose_check;
ALTER TABLE auth_token
  ADD CONSTRAINT auth_token_purpose_check CHECK (purpose IN ('email_verification', 'password_reset', 'email_change')),
  ADD COLUMN new_email text,
  ADD CONSTRAINT auth_token_new_email_check CHECK ((purpose = 'email_change') = (new_email IS NOT NULL));
