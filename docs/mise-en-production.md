# Mise en production — ce qui est prêt, ce qui reste à faire

> État au 5 novembre 2026. Le site actuel (VPS Hostinger + Coolify) est un **site de démonstration** : il ne doit
> recevoir **aucune vraie donnée de santé** tant que les points « bloquants » ci-dessous ne sont pas réglés.
> Les points réglementaires sont détaillés dans `docs/08-securite-conformite.md` ; ils demandent l'avis d'un juriste
> en droit de la santé et d'un spécialiste des dispositifs médicaux.

## Prêt dans le code (testé)

| Domaine | Ce qui est en place |
|---|---|
| Comptes | Mots de passe Argon2id, double authentification obligatoire (TOTP + codes de secours), sessions limitées (30 min d'inactivité, 12 h max), limitation des tentatives |
| Isolation des profils | Contrôle par l'application **et** Row-Level Security PostgreSQL, appliquée via le rôle `bilanx_app` même si le compte fourni par l'hébergeur est superutilisateur (migration 0012) |
| Chiffrement | Documents chiffrés par enveloppe (clé par document), secrets de double authentification chiffrés (AES-256-GCM) |
| Traçabilité | Journal d'audit chaîné, en ajout seul (droits PostgreSQL + déclencheur), recalculable depuis une sauvegarde (migration 0013) |
| E-mails | Envoi réel par SMTP (`BILANX_SMTP_URL`), chiffrement exigé, aucun contenu ni adresse complète dans les journaux en cas d'échec ; aucune donnée de santé dans les e-mails |
| Sauvegardes | Contrôle d'une sauvegarde restaurée avec la clé (`npm run sauvegarde:verifier`) ; planification via Coolify |
| Droits RGPD | Export complet (ZIP), retrait de consentement, suppression de profil et de compte (délai de grâce, effacement différé) |
| Application installable | Icône sur l'écran d'accueil (iPhone, Android, ordinateur), page hors ligne ; aucune donnée de santé stockée sur l'appareil |
| Accessibilité | Audit automatisé WCAG 2.2 AA sans violation (clair/sombre, ordinateur/téléphone), navigation au clavier |
| Honnêteté des données | Données fictives signalées partout, valeurs manquantes jamais complétées, extractions IA validées par un humain, aucune dose proposée |

## Bloquant avant toute vraie donnée de santé

1. **Hébergement certifié HDS** (art. L.1111-8 du Code de la santé publique) pour toute la chaîne qui stocke les
   données : application, base, sauvegardes. Un VPS Hostinger n'est pas certifié HDS. Choisir une offre HDS en
   vérifiant le certificat en cours de validité sur la liste publiée par l'Agence du numérique en santé
   (esante.gouv.fr). L'application est un conteneur Docker + PostgreSQL 16 : elle se déploie sur toute offre HDS
   proposant ces briques.
2. **Clé maîtresse** (`BILANX_SECRET_KEY`) gérée par le service de gestion de clés (KMS) de l'hébergeur HDS, pas en
   variable d'environnement en clair ; procédure écrite de conservation et de rotation.
3. **Analyse d'impact (AIPD)**, obligatoire pour ce traitement (outil PIA de la CNIL), registre des traitements,
   politique de confidentialité, mentions légales et conditions d'utilisation.
4. **Destination d'usage** rédigée et qualification au regard du règlement sur les dispositifs médicaux (MDR),
   relue par un spécialiste : elle conditionne ce que l'interface a le droit d'afficher (indicateurs, alertes).
5. **Prestataire d'e-mails** sous contrat (sous-traitant RGPD, art. 28), domaine d'envoi authentifié (SPF, DKIM, DMARC).
6. **Test d'intrusion** par un prestataire indépendant avant l'ouverture.

## Recommandé avant l'ouverture au public

- Supervision : alerte si `/api/sante` échoue, si le démarrage signale un SMTP injoignable, si une sauvegarde manque.
- Test de restauration planifié (par ex. mensuel) avec `npm run sauvegarde:verifier`, résultat consigné.
- Politique de conservation des journaux d'application (ils peuvent contenir des adresses IP).
- Procédure de violation de données (notification CNIL sous 72 h) et contact DPO.
- Audit d'accessibilité manuel (lecteurs d'écran VoiceOver et NVDA, zoom 200 %, utilisateurs) : l'audit automatisé
  ne couvre qu'une partie du RGAA.
- Retrait de `BILANX_BASIC_AUTH` et de la bannière « prototype » uniquement une fois les points bloquants réglés.

## Modules restants

- **Assistant IA** : prévu en V2, après l'analyse réglementaire (MDR, AI Act) et le choix d'un fournisseur sans
  rétention ni entraînement sur les données.
- **Synchronisations automatiques** (LibreView, Apple Santé via application iPhone) : non disponibles ; imports de
  fichiers à la place. Les formats doivent encore être validés sur de vrais exports.
