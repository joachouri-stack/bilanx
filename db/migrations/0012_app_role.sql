-- =====================================================================
-- BILANX — Migration 0012 : rôle applicatif sans contournement de la RLS
--   PostgreSQL n'applique JAMAIS la Row-Level Security à un superutilisateur
--   ni à un rôle BYPASSRLS, même avec FORCE. Or l'utilisateur fourni par
--   l'hébergeur (ex. « postgres » sur Coolify) est souvent superutilisateur.
--   L'application se connecte donc avec ce compte mais agit sous le rôle
--   « bilanx_app » (paramètre de connexion role=bilanx_app) :
--     * ni superutilisateur, ni BYPASSRLS, ni propriétaire des tables
--       → la RLS s'applique toujours ;
--     * lecture/écriture des données, SANS modification ni vidage du journal
--       d'audit, et lecture seule de la table des migrations.
--   Les migrations, elles, restent exécutées avec le compte de connexion.
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bilanx_app') THEN
    CREATE ROLE bilanx_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    -- Rôle préexistant (autre base du même serveur) : on garantit ses limites.
    ALTER ROLE bilanx_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  -- Le compte de connexion doit pouvoir endosser le rôle (inutile pour un superutilisateur).
  IF NOT pg_has_role(current_user, 'bilanx_app', 'MEMBER') THEN
    EXECUTE format('GRANT bilanx_app TO %I', current_user);
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO bilanx_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bilanx_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bilanx_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO bilanx_app;

-- Journal d'audit : ajout et lecture seulement. Migrations : lecture seule.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM bilanx_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON schema_migration FROM bilanx_app;

-- Tables créées par les migrations suivantes : mêmes droits par défaut.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bilanx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO bilanx_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO bilanx_app;
