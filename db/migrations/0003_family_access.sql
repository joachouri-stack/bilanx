-- =====================================================================
-- BILANX — Migration 0003 : famille, profils et autorisations par module
--
--   * Permissions par module stockées dans profile_access.permissions :
--       {"glucose":"read","lab":"write","documents":"none",...}
--     Le rôle 'owner' a tous les droits ; les autres rôles n'ont QUE ce qui
--     est explicitement accordé (absence de clé = aucun accès).
--   * La Row-Level Security vérifie désormais le module ET le type d'accès
--     (lecture / écriture) : un aidant en lecture seule ne peut ni modifier
--     ni supprimer, et un module non accordé est invisible, même en cas
--     d'erreur applicative.
--   * Si `app.profile_id` est défini, seules les lignes de ce profil sont visibles.
--   * Invitations : révocation, durée d'accès (obligatoire pour un
--     professionnel), traçabilité.
-- =====================================================================

-- Lien de parenté / relation déclaré par le créateur (affichage uniquement).
ALTER TABLE profile
  ADD COLUMN relationship text CHECK (relationship IN ('self', 'parent', 'child', 'spouse', 'sibling', 'grandparent', 'other'));
UPDATE profile p SET relationship = 'self'
  WHERE EXISTS (SELECT 1 FROM profile_access pa WHERE pa.profile_id = p.id AND pa.role = 'owner' AND pa.legal_basis = 'self');

ALTER TABLE profile_access
  ADD COLUMN legal_basis_attested_at timestamptz;   -- déclaration sur l'honneur horodatée (création d'un profil de proche)

-- Un seul propriétaire actif par profil.
CREATE UNIQUE INDEX profile_single_owner ON profile_access (profile_id) WHERE role = 'owner' AND revoked_at IS NULL;
CREATE INDEX profile_access_account_idx ON profile_access (account_id) WHERE revoked_at IS NULL;

ALTER TABLE access_invitation
  ADD COLUMN created_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN revoked_at        timestamptz,
  ADD COLUMN declined_at       timestamptz,
  ADD COLUMN accepted_by       uuid REFERENCES account(id),
  ADD COLUMN access_expires_at timestamptz,         -- fin de l'accès accordé (obligatoire pour un professionnel)
  ADD CONSTRAINT invitation_role_allowed CHECK (role IN ('caregiver', 'guest_professional')),
  ADD CONSTRAINT invitation_pro_expires CHECK (role <> 'guest_professional' OR access_expires_at IS NOT NULL);
CREATE INDEX access_invitation_profile_idx ON access_invitation (profile_id);

ALTER TABLE profile_access
  ADD CONSTRAINT access_pro_expires CHECK (role <> 'guest_professional' OR expires_at IS NOT NULL);

CREATE INDEX audit_log_profile_idx ON audit_log (profile_id, occurred_at DESC) WHERE profile_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- Contrôle d'accès par module pour la Row-Level Security
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_can_access_module(p uuid, module text, want_write boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile_access pa
    WHERE pa.profile_id = p
      AND pa.account_id = nullif(current_setting('app.account_id', true), '')::uuid
      AND pa.revoked_at IS NULL
      AND (pa.expires_at IS NULL OR pa.expires_at > now())
      AND (
        pa.role = 'owner'
        OR (CASE WHEN want_write THEN pa.permissions ->> module = 'write'
                 ELSE pa.permissions ->> module IN ('read', 'write') END)
      )
      -- Profil courant (app.profile_id) : pendant une opération sur un profil, seules ses lignes
      -- sont visibles, même si une requête oublie de filtrer (un gestionnaire de plusieurs profils
      -- ne voit jamais les données d'un proche en consultant les siennes).
      AND (nullif(current_setting('app.profile_id', true), '') IS NULL
           OR p = nullif(current_setting('app.profile_id', true), '')::uuid)
  );
$$;

-- Ancienne fonction : rendue robuste à un paramètre vide.
CREATE OR REPLACE FUNCTION app_can_access(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile_access pa
    WHERE pa.profile_id = p
      AND pa.account_id = nullif(current_setting('app.account_id', true), '')::uuid
      AND pa.revoked_at IS NULL
      AND (pa.expires_at IS NULL OR pa.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION app_is_profile_owner(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile_access pa
    WHERE pa.profile_id = p AND pa.role = 'owner' AND pa.revoked_at IS NULL
      AND pa.account_id = nullif(current_setting('app.account_id', true), '')::uuid
  );
$$;

DO $$
DECLARE
  m record;
BEGIN
  FOR m IN SELECT * FROM (VALUES
      ('document', 'documents'), ('extracted_value_draft', 'documents'),
      ('lab_result', 'lab'),
      ('glucose_source', 'glucose'), ('glucose_reading', 'glucose'), ('glucose_target', 'glucose'), ('glucose_daily_stats', 'glucose'),
      ('insulin_product', 'insulin'), ('insulin_dose', 'insulin'), ('treatment_change', 'insulin'),
      ('medication', 'medications'), ('medication_intake', 'medications'),
      ('journal_entry', 'journal'),
      ('activity_source', 'activity'), ('activity_hourly', 'activity'), ('activity_daily', 'activity'), ('activity_goal', 'activity'),
      ('appointment', 'appointments'),
      ('report', 'reports'), ('share_link', 'reports')
    ) AS t(tbl, module)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', m.tbl || '_profile_isolation', m.tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app_can_access_module(profile_id, %L, false))', m.tbl || '_read', m.tbl, m.module);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app_can_access_module(profile_id, %L, true))', m.tbl || '_insert', m.tbl, m.module);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app_can_access_module(profile_id, %L, true)) WITH CHECK (app_can_access_module(profile_id, %L, true))', m.tbl || '_update', m.tbl, m.module, m.module);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (app_can_access_module(profile_id, %L, true))', m.tbl || '_delete', m.tbl, m.module);
  END LOOP;
END $$;

-- Réglages du profil : lecture pour tout accès actif, modification par le propriétaire.
DROP POLICY IF EXISTS profile_module_profile_isolation ON profile_module;
CREATE POLICY profile_module_read ON profile_module FOR SELECT USING (app_can_access(profile_id));
CREATE POLICY profile_module_write ON profile_module FOR ALL USING (app_is_profile_owner(profile_id)) WITH CHECK (app_is_profile_owner(profile_id));

-- Disposition du tableau de bord : propre à chaque lecteur.
DROP POLICY IF EXISTS dashboard_module_profile_isolation ON dashboard_module;
CREATE POLICY dashboard_module_own ON dashboard_module FOR ALL
  USING (app_can_access(profile_id) AND account_id = nullif(current_setting('app.account_id', true), '')::uuid)
  WITH CHECK (app_can_access(profile_id) AND account_id = nullif(current_setting('app.account_id', true), '')::uuid);
