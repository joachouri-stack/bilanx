-- =====================================================================
-- BILANX — Migration 0018 : rappels de prise par notification (Web Push)
--   * push_subscription : appareils d'un COMPTE (point d'envoi + clés de
--     chiffrement fournies par le navigateur ; aucune donnée de santé) ;
--   * reminder_pref : un compte demande les rappels d'un profil (le sien, ou
--     celui d'un proche dont il suit les médicaments) ;
--   * reminder_sent : un rappel par prise et par compte, jamais deux (plusieurs
--     instances de l'application peuvent tourner en même temps).
--   La lecture des traitements par la tâche d'envoi se fait au nom du compte
--   (app.account_id) : la RLS du module Médicaments vérifie l'accès à chaque fois.
-- =====================================================================
CREATE TABLE push_subscription (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  endpoint        text NOT NULL UNIQUE,
  p256dh          text NOT NULL,
  auth            text NOT NULL,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count   int NOT NULL DEFAULT 0
);
CREATE INDEX push_subscription_account_idx ON push_subscription (account_id);

CREATE TABLE reminder_pref (
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  show_names  boolean NOT NULL DEFAULT false,   -- nom du médicament sur l'écran verrouillé
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, profile_id)
);

CREATE TABLE reminder_sent (
  medication_id uuid NOT NULL REFERENCES medication(id) ON DELETE CASCADE,
  scheduled_at  timestamptz NOT NULL,
  account_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (medication_id, scheduled_at, account_id)
);
CREATE INDEX reminder_sent_sent_idx ON reminder_sent (sent_at);
