# Décision 0007 — Préparation de la production : rôle applicatif, e-mails, sauvegardes

**Date** : 5 novembre 2026 · **Statut** : adoptée

## Rôle PostgreSQL de l'application
**Constat** : PostgreSQL n'applique jamais la Row-Level Security à un superutilisateur ou à un rôle `BYPASSRLS`, même
avec `FORCE ROW LEVEL SECURITY`. Le compte fourni par Coolify (`postgres`) est superutilisateur : sur le site de
démonstration, l'isolation entre profils ne reposait donc que sur les contrôles de l'application.

**Décision** : migration 0012, rôle `bilanx_app` (`NOLOGIN NOSUPERUSER NOBYPASSRLS`, non propriétaire des tables).
L'application se connecte avec `DATABASE_URL` mais demande le rôle à l'ouverture de la connexion (`role=bilanx_app`,
`createAppSql`). Les migrations gardent le compte de connexion. Droits : lecture/écriture des données ; journal
d'audit en ajout et lecture seuls (pas d'`UPDATE`, `DELETE` ni `TRUNCATE`, qui contournerait le déclencheur) ;
table des migrations en lecture seule. Les tests d'intégration utilisent le même rôle : la RLS est réellement testée.

## Journal d'audit recalculable
Le hachage chaîné portait sur le contexte JSON dans l'ordre d'écriture, perdu par `jsonb` : impossible à revérifier
pour un contexte à plusieurs clés. Format 2 (clés triées) pour les nouvelles entrées, colonne `hash_version`
(migration 0013, sans réécriture des lignes existantes). `verifyAuditChain` distingue chaînage rompu, contenu modifié
et anciennes entrées non recalculables.

## E-mails
`SmtpMailer` (nodemailer) si `BILANX_SMTP_URL` est défini, sinon affichage dans le journal (démonstration).
L'envoi ne lève jamais d'erreur vers l'appelant : une erreur révélerait à l'inscription qu'une adresse a déjà un
compte, et bloquerait des parcours où le lien peut être redemandé. Deux tentatives ; l'échec est journalisé sans
contenu (liens à usage unique) et avec l'adresse masquée. STARTTLS exigé hors poste local.

## Sauvegardes
Tout est dans PostgreSQL (documents chiffrés compris) : sauvegarde planifiée par Coolify (onglet Backups, S3 hors du
VPS). `npm run sauvegarde:verifier` contrôle une base restaurée avec la clé maîtresse : déchiffrement de chaque page
de document (empreinte SHA-256) et de chaque secret de double authentification, chaîne d'audit. Une sauvegarde sans
la clé est illisible : la clé est conservée séparément.
