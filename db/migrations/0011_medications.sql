-- =====================================================================
-- BILANX — Migration 0011 : médicaments
--   * traitement PRESCRIT recopié par l'utilisateur (BILANX ne le modifie
--     jamais) ; un changement de prescription arrête l'ancienne ligne et en
--     crée une nouvelle (`replaces_id`) : l'historique reste lisible ;
--   * arrêt daté (jour d'arrêt exclu) avec motif facultatif ;
--   * suivi des prises : une seule saisie par prise prévue, rejouable.
-- =====================================================================
ALTER TABLE medication
  ADD COLUMN created_by  uuid REFERENCES account(id),
  ADD COLUMN created_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at  timestamptz,
  ADD COLUMN deleted_at  timestamptz,
  ADD COLUMN stopped_on  date,
  ADD COLUMN stop_reason text,
  ADD COLUMN replaces_id uuid REFERENCES medication(id) ON DELETE SET NULL,
  ADD CONSTRAINT medication_stopped_consistent CHECK ((status = 'stopped') = (stopped_on IS NOT NULL));
CREATE INDEX medication_profile_idx ON medication (profile_id, status) WHERE deleted_at IS NULL;

ALTER TABLE medication_intake
  ADD COLUMN recorded_by uuid REFERENCES account(id),
  ADD COLUMN recorded_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX medication_intake_slot ON medication_intake (medication_id, scheduled_at);
CREATE INDEX medication_intake_profile_idx ON medication_intake (profile_id, scheduled_at);
