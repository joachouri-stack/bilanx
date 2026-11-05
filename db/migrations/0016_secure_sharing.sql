-- =====================================================================
-- BILANX — Migration 0016 : partage sécurisé d'un rapport avec un
-- professionnel de santé
--   * le rapport partagé est un PDF figé au moment du partage, chiffré
--     (report.data_enc), effacé à la révocation ou après expiration ;
--   * lien (jeton) + code transmis séparément ; journal de chaque accès
--     (share_access, en ajout seul pour le public) ;
--   * accès SANS compte : la RLS n'autorise la lecture d'un partage (et de
--     son rapport) qu'à qui présente le jeton, via le paramètre de session
--     app.share_token_hash (SHA-256 du jeton, en hexadécimal). Aucune
--     fonction SECURITY DEFINER : le rôle applicatif reste soumis à la RLS.
-- =====================================================================
ALTER TABLE report
  ADD COLUMN data_enc bytea,
  ADD COLUMN size_bytes int;

ALTER TABLE share_link
  ADD COLUMN created_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN recipient    text,                 -- ex. « Dr Martin, endocrinologue »
  ADD COLUMN sharer_name  text NOT NULL DEFAULT '';  -- prénom affiché au destinataire

CREATE TABLE share_access (
  id          bigserial PRIMARY KEY,
  share_id    uuid NOT NULL REFERENCES share_link(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profile(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  success     boolean NOT NULL,
  ip_hash     bytea,
  user_agent  text
);
CREATE INDEX share_access_share_idx ON share_access (share_id, occurred_at);

-- Jeton présenté par le visiteur (NULL hors d'une consultation publique).
CREATE OR REPLACE FUNCTION app_share_token_hash() RETURNS bytea LANGUAGE sql STABLE AS $$
  SELECT decode(nullif(current_setting('app.share_token_hash', true), ''), 'hex')
$$;

CREATE POLICY share_link_by_token ON share_link FOR SELECT USING (token_hash = app_share_token_hash());
CREATE POLICY report_by_token ON report FOR SELECT USING (
  EXISTS (SELECT 1 FROM share_link s WHERE s.report_id = report.id AND s.token_hash = app_share_token_hash())
);

ALTER TABLE share_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_access FORCE ROW LEVEL SECURITY;
-- Titulaire (module Rapports) : lecture du journal.
CREATE POLICY share_access_read ON share_access FOR SELECT USING (app_can_access_module(profile_id, 'reports', false));
-- Visiteur muni du jeton : lecture (décompte des essais) et ajout pour CE partage seulement.
CREATE POLICY share_access_by_token_read ON share_access FOR SELECT USING (
  EXISTS (SELECT 1 FROM share_link s WHERE s.id = share_id AND s.token_hash = app_share_token_hash())
);
CREATE POLICY share_access_by_token_insert ON share_access FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM share_link s WHERE s.id = share_id AND s.profile_id = share_access.profile_id AND s.token_hash = app_share_token_hash())
);
-- Journal en ajout seul : ni modification ni effacement par l'application (seule la suppression du profil l'efface).
REVOKE UPDATE, DELETE, TRUNCATE ON share_access FROM bilanx_app;
GRANT EXECUTE ON FUNCTION app_share_token_hash() TO bilanx_app;

-- Effacement automatique (tâche de fond, sans compte) : uniquement quand la tâche s'annonce
-- (app.purge = 'on'), uniquement les rapports dont TOUS les partages sont expirés ou révoqués,
-- et la seule modification permise est d'effacer le PDF.
CREATE OR REPLACE FUNCTION app_report_purgeable(r uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('app.purge', true) = 'on'
     AND EXISTS (SELECT 1 FROM share_link s WHERE s.report_id = r)
     AND NOT EXISTS (SELECT 1 FROM share_link s WHERE s.report_id = r AND s.revoked_at IS NULL AND s.expires_at > now())
$$;
-- En mode purge, les métadonnées des partages (dates, empreintes, aucune donnée de santé) sont
-- lisibles, pour que « tous les partages sont expirés » soit évalué sur TOUS les partages.
CREATE POLICY share_link_purge_read ON share_link FOR SELECT USING (current_setting('app.purge', true) = 'on');
CREATE POLICY report_purge_read ON report FOR SELECT USING (app_report_purgeable(id));
CREATE POLICY report_purge_erase ON report FOR UPDATE USING (app_report_purgeable(id)) WITH CHECK (data_enc IS NULL);
GRANT EXECUTE ON FUNCTION app_report_purgeable(uuid) TO bilanx_app;
