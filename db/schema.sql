-- =====================================================================
-- BILANX — Schéma PostgreSQL 16 (MVP)
-- Conventions :
--   * toutes les données de santé portent profile_id (isolation + RLS)
--   * toute valeur de santé porte une source (source_type + source_ref)
--   * horodatages en timestamptz (UTC), affichage dans le fuseau du profil
--   * glycémie stockée en mg/dL (canonique), conversion à l'affichage
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------
CREATE TYPE access_role       AS ENUM ('owner', 'self', 'caregiver', 'guest_professional');
CREATE TYPE data_source_type  AS ENUM ('manual', 'document_extraction', 'libreview_import',
                                       'healthkit', 'health_connect', 'abbott_partner_api', 'demo');
CREATE TYPE glucose_kind      AS ENUM ('sensor', 'capillary', 'lab');
CREATE TYPE extraction_status AS ENUM ('pending', 'processing', 'to_review', 'reviewed', 'failed');
CREATE TYPE draft_status      AS ENUM ('proposed', 'confirmed', 'corrected', 'rejected');
CREATE TYPE document_kind     AS ENUM ('lab_report', 'prescription', 'medical_report',
                                       'exam_result', 'letter', 'other', 'unknown');
CREATE TYPE insulin_type      AS ENUM ('rapid', 'long', 'intermediate', 'mixed', 'other');
CREATE TYPE event_kind        AS ENUM ('meal', 'activity', 'stress', 'sleep', 'illness',
                                       'symptom', 'medication', 'injection', 'other');
CREATE TYPE meal_kind         AS ENUM ('breakfast', 'lunch', 'dinner', 'snack');

-- ---------------------------------------------------------------------
-- Comptes, authentification, sécurité
-- ---------------------------------------------------------------------
CREATE TABLE account (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            citext UNIQUE NOT NULL,
  email_verified_at timestamptz,
  password_hash    text,                        -- argon2id
  locale           text NOT NULL DEFAULT 'fr-FR',
  created_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz                  -- suppression logique avant purge planifiée
);

CREATE TABLE mfa_factor (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('totp', 'webauthn', 'recovery_codes')),
  secret_enc   bytea NOT NULL,                  -- chiffré (clé KMS)
  label        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE TABLE session (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  mfa_passed  boolean NOT NULL DEFAULT false,
  ip_hash     bytea,                            -- IP hachée (minimisation)
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);

CREATE TABLE login_event (                      -- historique des connexions visible par l'utilisateur
  id          bigserial PRIMARY KEY,
  account_id  uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  success     boolean NOT NULL,
  method      text NOT NULL,                    -- password, passkey, totp...
  ip_country  text,
  user_agent  text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Profils et accès (famille, aidants, professionnels)
-- ---------------------------------------------------------------------
CREATE TABLE profile (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name   text NOT NULL,
  birth_date     date,
  sex_at_birth   text CHECK (sex_at_birth IN ('female', 'male', 'unspecified')),
  timezone       text NOT NULL DEFAULT 'Europe/Paris',
  glucose_unit   text NOT NULL DEFAULT 'mg/dL' CHECK (glucose_unit IN ('mg/dL', 'mmol/L')),
  hba1c_unit     text NOT NULL DEFAULT '%'     CHECK (hba1c_unit IN ('%', 'mmol/mol')),
  is_demo        boolean NOT NULL DEFAULT false,  -- données fictives clairement identifiées
  created_by     uuid NOT NULL REFERENCES account(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE TABLE profile_access (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  account_id     uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  role           access_role NOT NULL,
  -- permissions par module : {"glucose":"rw","lab":"r","documents":"none",...}
  permissions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  legal_basis    text,                          -- ex. 'consent', 'parental_authority', 'legal_protection_measure'
  consent_id     uuid,                          -- consentement de la personne concernée si applicable
  granted_by     uuid REFERENCES account(id),
  granted_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz,                   -- obligatoire pour guest_professional
  revoked_at     timestamptz,
  revoked_by     uuid REFERENCES account(id),
  UNIQUE (profile_id, account_id, role)
);

CREATE TABLE access_invitation (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  invited_email citext NOT NULL,
  role         access_role NOT NULL,
  permissions  jsonb NOT NULL DEFAULT '{}'::jsonb,
  token_hash   bytea NOT NULL UNIQUE,
  created_by   uuid NOT NULL REFERENCES account(id),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz
);

CREATE TABLE consent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  profile_id    uuid REFERENCES profile(id) ON DELETE CASCADE,
  purpose       text NOT NULL,                 -- 'health_data_processing', 'ai_extraction', 'ai_assistant', 'caregiver_access:<id>'...
  version       text NOT NULL,                 -- version du texte affiché
  given_at      timestamptz NOT NULL DEFAULT now(),
  withdrawn_at  timestamptz
);

-- Journal d'accès immuable (append-only : UPDATE/DELETE interdits par trigger + droits)
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  account_id   uuid,
  profile_id   uuid,
  action       text NOT NULL,                  -- 'read', 'create', 'update', 'delete', 'export', 'share'...
  resource     text NOT NULL,                  -- 'lab_result', 'document'...
  resource_id  text,
  context      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- jamais de valeur de santé ici
  prev_hash    bytea,                          -- chaînage d'intégrité
  row_hash     bytea
);

-- ---------------------------------------------------------------------
-- Tableau de bord personnalisable
-- ---------------------------------------------------------------------
CREATE TABLE dashboard_module (
  profile_id   uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  account_id   uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE, -- la vue est propre à chaque lecteur
  module_key   text NOT NULL,                  -- 'glucose_last', 'hba1c', 'steps_today', 'insulin_today'...
  position     int  NOT NULL,
  visible      boolean NOT NULL DEFAULT true,
  PRIMARY KEY (profile_id, account_id, module_key)
);

CREATE TABLE profile_module (                   -- modules activés pour le profil
  profile_id  uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  module      text NOT NULL,                    -- 'glucose','insulin','lab','activity','meds','journal','appointments'
  enabled     boolean NOT NULL DEFAULT true,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (profile_id, module)
);

-- ---------------------------------------------------------------------
-- Documents et extraction IA
-- ---------------------------------------------------------------------
CREATE TABLE document (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  kind           document_kind NOT NULL DEFAULT 'unknown',
  title          text,
  storage_key    text NOT NULL,                 -- clé objet (chiffré)
  dek_enc        bytea NOT NULL,                -- clé de chiffrement du document, chiffrée par la KMS
  sha256         bytea NOT NULL,
  mime_type      text NOT NULL,
  page_count     int,
  size_bytes     bigint NOT NULL,
  document_date  date,                          -- date du document (prélèvement / ordonnance)
  issuer         text,                          -- laboratoire, médecin
  uploaded_by    uuid NOT NULL REFERENCES account(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE TABLE extraction_job (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  status         extraction_status NOT NULL DEFAULT 'pending',
  detected_kind  document_kind,
  ocr_engine     text,
  model_name     text,                          -- modèle IA utilisé (traçabilité)
  prompt_version text,
  detected_lab   text,
  detected_sampling_date date,
  warnings       jsonb NOT NULL DEFAULT '[]'::jsonb,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);

-- Valeurs proposées par l'IA : JAMAIS considérées comme résultats tant que non confirmées
CREATE TABLE extracted_value_draft (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           uuid NOT NULL REFERENCES extraction_job(id) ON DELETE CASCADE,
  profile_id       uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  raw_label        text NOT NULL,               -- texte littéral du document
  raw_value        text NOT NULL,
  raw_unit         text,
  raw_reference    text,
  page             int,
  bbox             jsonb,                       -- {x,y,w,h} normalisés pour surlignage
  matched_analyte  text,                        -- FK ajoutée après création de la table analyte
  parsed_value     numeric,
  parsed_unit      text,
  ref_low          numeric,
  ref_high         numeric,
  confidence       numeric CHECK (confidence BETWEEN 0 AND 1),
  checks           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- incohérences détectées
  status           draft_status NOT NULL DEFAULT 'proposed',
  reviewed_by      uuid REFERENCES account(id),
  reviewed_at      timestamptz
);

-- ---------------------------------------------------------------------
-- Biologie
-- ---------------------------------------------------------------------
CREATE TABLE analyte (                          -- bibliothèque évolutive de paramètres
  code             text PRIMARY KEY,            -- 'ferritin', 'hba1c', 'vitamin_d_25oh'...
  loinc_codes      text[] NOT NULL DEFAULT '{}',
  name_fr          text NOT NULL,
  synonyms         text[] NOT NULL DEFAULT '{}',-- 'Ferritinémie', 'Ferritine sérique'...
  category         text NOT NULL,               -- 'iron', 'vitamins', 'minerals', 'kidney', 'lipids', 'thyroid', 'diabetes', 'inflammation', 'hormones'
  canonical_unit   text NOT NULL,
  -- conversions autorisées : [{"unit":"nmol/L","factor":0.4006}] (valeur_canonique = valeur * factor)
  unit_conversions jsonb NOT NULL DEFAULT '[]'::jsonb,
  plausible_min    numeric,                     -- garde-fou physiologique (contrôle d'incohérence)
  plausible_max    numeric,
  education_md     text,                        -- explication pédagogique relue médicalement
  education_reviewed_at date
);

ALTER TABLE extracted_value_draft
  ADD CONSTRAINT extracted_value_draft_analyte_fk
  FOREIGN KEY (matched_analyte) REFERENCES analyte(code);

CREATE TABLE lab_result (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  analyte_code    text NOT NULL REFERENCES analyte(code),
  value           numeric NOT NULL,             -- valeur telle que rapportée par le laboratoire
  unit            text NOT NULL,
  value_canonical numeric,                      -- valeur convertie dans l'unité canonique si applicable
  comparator      text CHECK (comparator IN ('<', '<=', '>', '>=')),  -- ex. "< 5"
  ref_low         numeric,                      -- références DU LABORATOIRE pour CE résultat
  ref_high        numeric,
  ref_text        text,                         -- référence textuelle si non numérique
  sampled_at      timestamptz NOT NULL,         -- date réelle de prélèvement
  laboratory      text,
  source_type     data_source_type NOT NULL,
  document_id     uuid REFERENCES document(id) ON DELETE SET NULL,
  draft_id        uuid REFERENCES extracted_value_draft(id) ON DELETE SET NULL,
  confirmed_by    uuid NOT NULL REFERENCES account(id),   -- toujours une confirmation humaine
  confirmed_at    timestamptz NOT NULL DEFAULT now(),
  note            text,
  deleted_at      timestamptz
);
CREATE INDEX lab_result_profile_analyte_idx ON lab_result (profile_id, analyte_code, sampled_at DESC);

-- ---------------------------------------------------------------------
-- Glycémie
-- ---------------------------------------------------------------------
CREATE TABLE glucose_source (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  source_type     data_source_type NOT NULL,
  device_label    text,                         -- 'FreeStyle Libre 2'
  status          text NOT NULL CHECK (status IN ('not_connected', 'file_import', 'active', 'error', 'revoked')),
  last_sync_at    timestamptz,                  -- affiché systématiquement
  last_error      text
);

CREATE TABLE glucose_reading (
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  measured_at    timestamptz NOT NULL,
  value_mgdl     numeric(6,1) NOT NULL CHECK (value_mgdl BETWEEN 10 AND 700),
  kind           glucose_kind NOT NULL,         -- capteur ≠ capillaire ≠ labo
  source_id      uuid REFERENCES glucose_source(id) ON DELETE SET NULL,
  import_batch   uuid,
  PRIMARY KEY (profile_id, kind, measured_at)    -- dédoublonnage naturel des ré-imports
) PARTITION BY RANGE (measured_at);
-- Partitions mensuelles créées par migration/cron (pg_partman recommandé)
CREATE TABLE glucose_reading_default PARTITION OF glucose_reading DEFAULT;

CREATE TABLE glucose_target (
  profile_id    uuid PRIMARY KEY REFERENCES profile(id) ON DELETE CASCADE,
  low_mgdl      numeric NOT NULL DEFAULT 70,
  high_mgdl     numeric NOT NULL DEFAULT 180,
  very_low_mgdl numeric NOT NULL DEFAULT 54,
  very_high_mgdl numeric NOT NULL DEFAULT 250,
  defined_with  text,                           -- 'équipe soignante', 'par défaut (consensus international)'
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE glucose_daily_stats (              -- agrégats recalculés après chaque import
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  day            date NOT NULL,
  kind           glucose_kind NOT NULL,
  n              int NOT NULL,
  mean_mgdl      numeric, sd_mgdl numeric, min_mgdl numeric, max_mgdl numeric,
  pct_very_low numeric, pct_low numeric, pct_in_range numeric, pct_high numeric, pct_very_high numeric,
  coverage_pct   numeric,                       -- % de données disponibles sur la journée
  PRIMARY KEY (profile_id, day, kind)
);

-- ---------------------------------------------------------------------
-- Insuline et traitements
-- ---------------------------------------------------------------------
CREATE TABLE insulin_product (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  name         text NOT NULL,                   -- saisi par l'utilisateur
  type         insulin_type NOT NULL,
  active       boolean NOT NULL DEFAULT true
);

CREATE TABLE insulin_dose (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES insulin_product(id),
  units        numeric(5,1) NOT NULL CHECK (units > 0 AND units <= 300),
  occurred_at  timestamptz NOT NULL,
  status       text NOT NULL CHECK (status IN ('planned', 'taken', 'skipped')),
  comment      text,
  source_type  data_source_type NOT NULL DEFAULT 'manual',
  created_by   uuid NOT NULL REFERENCES account(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insulin_dose_idx ON insulin_dose (profile_id, occurred_at DESC);

-- Historique des modifications PRESCRITES (déclaratif ; BILANX ne propose jamais de dose)
CREATE TABLE treatment_change (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  subject        text NOT NULL,                 -- 'insulin:<product_id>' ou 'medication:<id>'
  effective_date date NOT NULL,
  previous_regimen text,
  new_regimen    text NOT NULL,
  prescribed_by  text,                          -- nom du médecin, saisi par l'utilisateur
  goal_note      text,                          -- objectif défini AVEC le médecin
  document_id    uuid REFERENCES document(id) ON DELETE SET NULL,
  created_by     uuid NOT NULL REFERENCES account(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE medication (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  name           text NOT NULL,
  cis_code       text,                          -- code BDPM si correspondance
  strength       text,                          -- dosage
  posology_text  text NOT NULL,                 -- posologie prescrite, verbatim
  schedule       jsonb NOT NULL DEFAULT '[]'::jsonb,  -- horaires [{"time":"08:00","qty":"1 cp"}]
  start_date     date,
  end_date       date,
  prescriber     text,
  document_id    uuid REFERENCES document(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'stopped')),
  reminders_on   boolean NOT NULL DEFAULT false, -- activable uniquement si status = 'active'
  source_type    data_source_type NOT NULL DEFAULT 'manual',
  confirmed_by   uuid REFERENCES account(id),
  confirmed_at   timestamptz,
  CHECK (status <> 'active' OR confirmed_by IS NOT NULL),
  CHECK (NOT reminders_on OR status = 'active')
);

CREATE TABLE medication_intake (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES medication(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  scheduled_at  timestamptz,
  taken_at      timestamptz,
  status        text NOT NULL CHECK (status IN ('taken', 'skipped', 'missed'))
);

-- ---------------------------------------------------------------------
-- Journal (repas et événements)
-- ---------------------------------------------------------------------
CREATE TABLE journal_entry (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  kind           event_kind NOT NULL,
  meal_kind      meal_kind,
  occurred_at    timestamptz NOT NULL,
  ended_at       timestamptz,
  description    text,
  quantities     text,
  carbs_g        numeric(5,1),                  -- uniquement si renseigné par l'utilisateur
  intensity      smallint CHECK (intensity BETWEEN 1 AND 5),
  photo_document_id uuid REFERENCES document(id) ON DELETE SET NULL,
  comment        text,
  created_by     uuid NOT NULL REFERENCES account(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'meal' OR meal_kind IS NOT NULL)
);
CREATE INDEX journal_entry_idx ON journal_entry (profile_id, occurred_at);

-- ---------------------------------------------------------------------
-- Activité physique
-- ---------------------------------------------------------------------
CREATE TABLE activity_source (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  source_type   data_source_type NOT NULL,
  device_label  text,
  status        text NOT NULL CHECK (status IN ('not_connected', 'file_import', 'active', 'error', 'revoked')),
  last_sync_at  timestamptz
);

CREATE TABLE activity_hourly (
  profile_id   uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  hour_start   timestamptz NOT NULL,
  steps        int NOT NULL CHECK (steps >= 0),
  source_id    uuid REFERENCES activity_source(id) ON DELETE SET NULL,  -- statistique déjà dédoublonnée
  PRIMARY KEY (profile_id, hour_start)
);

CREATE TABLE activity_daily (
  profile_id   uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  day          date NOT NULL,
  steps        int NOT NULL CHECK (steps >= 0),
  source_id    uuid REFERENCES activity_source(id) ON DELETE SET NULL,
  PRIMARY KEY (profile_id, day)
);

CREATE TABLE activity_goal (
  profile_id   uuid PRIMARY KEY REFERENCES profile(id) ON DELETE CASCADE,
  daily_steps  int NOT NULL DEFAULT 8000
);

-- ---------------------------------------------------------------------
-- Rendez-vous
-- ---------------------------------------------------------------------
CREATE TABLE appointment (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  starts_at      timestamptz NOT NULL,
  specialty      text,
  practitioner   text,
  location       text,
  reason         text,
  to_prepare     text,
  reminder_minutes int[],
  notes_after    text,
  created_by     uuid NOT NULL REFERENCES account(id)
);

CREATE TABLE appointment_link (                 -- documents / résultats associés
  appointment_id uuid NOT NULL REFERENCES appointment(id) ON DELETE CASCADE,
  document_id    uuid REFERENCES document(id) ON DELETE CASCADE,
  lab_result_id  uuid REFERENCES lab_result(id) ON DELETE CASCADE,
  CHECK (num_nonnulls(document_id, lab_result_id) = 1)
);

-- ---------------------------------------------------------------------
-- Rapports et partage
-- ---------------------------------------------------------------------
CREATE TABLE report (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  sections      text[] NOT NULL,
  storage_key   text,
  generated_by  uuid NOT NULL REFERENCES account(id),
  generated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE share_link (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  report_id     uuid REFERENCES report(id) ON DELETE CASCADE,
  token_hash    bytea NOT NULL UNIQUE,
  access_code_hash bytea,                       -- code transmis séparément
  expires_at    timestamptz NOT NULL,
  max_views     int,
  view_count    int NOT NULL DEFAULT 0,
  created_by    uuid NOT NULL REFERENCES account(id),
  revoked_at    timestamptz
);

-- ---------------------------------------------------------------------
-- Row-Level Security : un compte ne voit que les profils auxquels il a un accès actif
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_can_access(p uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile_access pa
    WHERE pa.profile_id = p
      AND pa.account_id = current_setting('app.account_id', true)::uuid
      AND pa.revoked_at IS NULL
      AND (pa.expires_at IS NULL OR pa.expires_at > now())
  );
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'document','extracted_value_draft','lab_result','glucose_source','glucose_reading',
    'glucose_target','glucose_daily_stats','insulin_product','insulin_dose','treatment_change',
    'medication','medication_intake','journal_entry','activity_source','activity_hourly',
    'activity_daily','activity_goal','appointment','report','share_link','profile_module','dashboard_module'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_can_access(profile_id)) WITH CHECK (app_can_access(profile_id))',
                   t || '_profile_isolation', t);
  END LOOP;
END $$;

-- Journal d'audit : ajout uniquement
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log est en ajout seul';
END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
