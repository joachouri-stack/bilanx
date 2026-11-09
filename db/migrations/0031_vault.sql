-- =====================================================================
-- BILANX — Migration 0031 : coffre d'identifiants (Doctolib, Ameli, mutuelle…)
--   * personnel : rattaché au compte, jamais partagé avec les proches ;
--   * mot de passe chiffré (AES-256-GCM, clé dérivée de BILANX_SECRET_KEY, lié au compte et à l'entrée) ;
--   * chaque affichage d'un mot de passe est inscrit au journal d'audit.
-- =====================================================================
CREATE TABLE vault_entry (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  service     text NOT NULL CHECK (length(service) BETWEEN 1 AND 80),
  url         text,
  login       text,
  secret_enc  bytea NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vault_entry_account_idx ON vault_entry (account_id, service);
GRANT SELECT, INSERT, UPDATE, DELETE ON vault_entry TO bilanx_app;
