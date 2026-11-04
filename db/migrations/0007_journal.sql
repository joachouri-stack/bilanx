-- =====================================================================
-- BILANX — Migration 0007 : journal des repas et des événements
--   * suppression logique (historique conservé, journalisé) ;
--   * index de lecture par journée.
-- =====================================================================
ALTER TABLE journal_entry ADD COLUMN deleted_at timestamptz;
DROP INDEX IF EXISTS journal_entry_idx;
CREATE INDEX journal_entry_idx ON journal_entry (profile_id, occurred_at) WHERE deleted_at IS NULL;
