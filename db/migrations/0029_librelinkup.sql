-- =====================================================================
-- BILANX — Migration 0029 : capteur FreeStyle Libre via LibreLinkUp (suiveur)
--   * BILANX se connecte comme un « proche suiveur » LibreLinkUp (compte dédié, lecture seule) ;
--   * identifiants du compte suiveur chiffrés (AES-256-GCM, clé dérivée de BILANX_SECRET_KEY) ;
--   * un lien par profil ; le compte qui l'a créé sert d'acteur pour l'écriture (droits revérifiés) ;
--   * mesures écrites dans glucose_reading (kind 'sensor') : dédoublonnage par la clé primaire.
-- =====================================================================
ALTER TYPE data_source_type ADD VALUE IF NOT EXISTS 'librelinkup';

CREATE TABLE libre_link (
  profile_id      uuid PRIMARY KEY REFERENCES profile(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  email           text NOT NULL,
  password_enc    bytea NOT NULL,
  api_host        text NOT NULL DEFAULT 'api-eu.libreview.io',
  patient_id      text,
  patient_name    text,
  user_id         text,
  token_enc       bytea,
  token_expires   timestamptz,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
  failures        int NOT NULL DEFAULT 0,
  last_sync_at    timestamptz,
  last_reading_at timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
