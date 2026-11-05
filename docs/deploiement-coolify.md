# Déployer BILANX sur Coolify (site de démonstration)

> ⚠️ **Site de démonstration uniquement.** Un VPS classique n'est pas un hébergement certifié HDS : n'y saisissez
> **aucune vraie donnée de santé**. Utilisez des comptes et des valeurs de test. Protégez le site par mot de passe
> (étape 3, variable `BILANX_BASIC_AUTH`).

Durée : environ 15 minutes. Tout se fait dans l'interface web de Coolify.

## 1. Créer la base de données PostgreSQL

1. Dans votre projet Coolify : **+ New** → **Database** → **PostgreSQL**.
2. Choisissez la version **16** (image `postgres:16-alpine`), laissez les autres réglages par défaut.
3. Cliquez sur **Start** et attendez l'état *Running*.
4. Dans la page de la base, copiez l'adresse **Postgres URL (internal)**. Elle ressemble à
   `postgres://postgres:MOTDEPASSE@xxxxxxxx:5432/postgres`. Ne l'exposez pas publiquement (laissez « Make it publicly
   available » désactivé).

## 2. Créer l'application

1. **+ New** → **Application** → **Private Repository (with GitHub App)** (ou *Public Repository* si le dépôt est public).
2. Dépôt : `joachouri-stack/bilanx`, branche : `main`.
3. **Build Pack** : **Dockerfile** (le fichier `Dockerfile` est à la racine du dépôt).
4. **Ports Exposes** : `3000`.
5. **Domains** : gardez le domaine provisoire proposé par Coolify. Écrivez-le de préférence en **https://** : Coolify
   obtient alors un certificat automatiquement.
6. **Health check** (onglet *Healthcheck*, facultatif) : chemin `/api/sante`, port `3000`.

## 3. Variables d'environnement

Onglet **Environment Variables** de l'application, ajoutez :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | l'adresse *Postgres URL (internal)* copiée à l'étape 1 |
| `BILANX_SECRET_KEY` | une clé aléatoire : sur votre ordinateur, `openssl rand -base64 32`, ou le générateur de Coolify, 32 octets en base64. **Ne la changez plus ensuite** : elle chiffre les secrets de double authentification |
| `BILANX_APP_URL` | l'adresse publique exacte du site, par ex. `https://xxxx.sslip.io` (sans `/` final) |
| `BILANX_BASIC_AUTH` | `identifiant:motdepasse` choisis par vous : le navigateur les demandera avant d'afficher le site |

Facultatif, pour envoyer réellement les e-mails (voir étape 5) :

| Variable | Valeur |
|---|---|
| `BILANX_SMTP_URL` | `smtp://identifiant:motdepasse@serveur:587` fourni par un prestataire d'e-mails transactionnels (port 587 avec STARTTLS, ou `smtps://…:465`). Encodez les caractères spéciaux du mot de passe (`@` → `%40`, `:` → `%3A`) |
| `BILANX_MAIL_FROM` | l'expéditeur, par ex. `BILANX <no-reply@bilanx.fr>` (adresse d'un domaine validé chez le prestataire) |

Uniquement si votre domaine provisoire est en **http** (sans certificat) : ajoutez aussi
`BILANX_ALLOW_INSECURE_HTTP` = `true`. Les cookies ne seront alors pas marqués « Secure » ; à éviter dès que possible.

## 4. Déployer

Cliquez sur **Deploy**. Dans les journaux de déploiement puis de l'application, vous devez voir :

```
Application des migrations…
✓ 0001_initial.sql
…
Démarrage de BILANX…
✓ Ready
```

Les migrations de base de données s'appliquent automatiquement à chaque démarrage ; celles déjà appliquées sont
ignorées (« Base à jour. »).

**Isolation des données** : l'application ne travaille pas avec le compte `postgres` (superutilisateur, pour qui
PostgreSQL ignore la Row-Level Security) mais sous un rôle dédié, `bilanx_app`, créé automatiquement par les migrations.
Rien à configurer : la séparation entre profils est ainsi garantie aussi par la base, en plus de l'application.

Pour redéployer après une mise à jour du dépôt : bouton **Redeploy**, ou activez le déploiement automatique sur la
branche `main` (*Webhooks* / *Auto Deploy*).

## Tâches automatiques

L'application efface d'elle-même les comptes dont la suppression est arrivée à échéance (7 jours) et les profils
supprimés depuis plus de 30 jours : 1 minute après chaque démarrage, puis toutes les 6 heures. Rien à configurer.

## 5. Créer votre compte

**Sans `BILANX_SMTP_URL`** (site de démonstration) : les e-mails ne partent pas, **ils s'affichent dans les journaux de
l'application** (le journal le rappelle au démarrage : « aucun BILANX_SMTP_URL »).

1. Ouvrez le site (identifiant et mot de passe de `BILANX_BASIC_AUTH`), puis **Créer un compte**.
2. Dans Coolify, onglet **Logs** de l'application : cherchez le message « Confirmez votre adresse e-mail BILANX » et
   ouvrez le lien `…/verifier-email?jeton=…` qu'il contient.
3. Connectez-vous et configurez la double authentification avec une application d'authentification sur votre
   téléphone. Conservez les codes de secours.

Les invitations envoyées depuis *Famille & Profils* apparaissent de la même façon dans les journaux.

**Avec `BILANX_SMTP_URL`** : les e-mails partent réellement et les liens n'apparaissent plus dans les journaux. Au
démarrage, le journal indique « E-mails : serveur SMTP joignable, envoi réel activé. » ou, sinon, la cause (serveur
injoignable, identifiants refusés). Un envoi en échec n'interrompt jamais un parcours : il est réessayé une fois puis
noté dans le journal (adresse masquée, sans le contenu) ; l'utilisateur peut redemander le lien. Pour que les e-mails
n'arrivent pas en indésirables, déclarez chez le prestataire votre domaine d'envoi (enregistrements SPF et DKIM dans
la zone DNS, par ex. chez Hostinger).

## Installer BILANX sur votre téléphone

Ouvrez le site sur le téléphone, puis **Paramètres → Installer BILANX sur votre téléphone** : la page indique la
marche à suivre (iPhone : Safari → Partager → **Sur l'écran d'accueil** ; Android : bouton **Installer**).

- Le site doit être en **https** : sans certificat, le navigateur refuse le service worker (pas de page hors ligne, et
  pas de bouton d'installation sur Android). L'ajout à l'écran d'accueil de l'iPhone fonctionne malgré tout.
- Avec `BILANX_BASIC_AUTH`, le mot de passe de démonstration est demandé à la première ouverture de l'application
  installée.
- Aucune donnée de santé n'est conservée sur le téléphone : une connexion internet reste nécessaire.

## Sauvegardes

Toutes les données sont dans PostgreSQL, documents scannés compris (chiffrés). Une sauvegarde de la base suffit donc,
**mais elle est inutilisable sans `BILANX_SECRET_KEY`** : conservez cette clé à part (gestionnaire de mots de passe),
jamais à côté des sauvegardes.

1. Page de la base PostgreSQL dans Coolify → onglet **Backups** → **Add** : fréquence quotidienne (par ex. `0 3 * * *`),
   conservation de 14 sauvegardes.
2. Recommandé : envoyez-les hors du VPS (**S3 Storages** de Coolify : un stockage S3 chez un autre prestataire). Une
   sauvegarde restée sur le même serveur disparaît avec lui.
3. **Testez la restauration**, au moins une fois puis après chaque changement important. Sur votre ordinateur, avec le
   dépôt et PostgreSQL 16 (`docker compose up -d`) :

   ```bash
   createdb -h localhost -U bilanx restauration
   pg_restore -h localhost -U bilanx -d restauration --no-owner sauvegarde.dump
   DATABASE_URL=postgres://bilanx:bilanx@localhost:5432/restauration BILANX_SECRET_KEY=… npm run sauvegarde:verifier
   ```

   Le contrôle déchiffre chaque document et chaque secret de double authentification avec la clé, et vérifie le
   chaînage du journal d'audit. Il se termine par « ✓ Sauvegarde exploitable avec cette clé. » ou explique ce qui ne va
   pas (mauvaise clé, document altéré, journal modifié).

## 6. Plus tard : brancher bilanx.fr

1. Dans la zone DNS de votre domaine chez Hostinger, créez un enregistrement **A** pour `@` (et `www` si souhaité)
   pointant vers l'adresse IP de votre VPS.
2. Dans Coolify, champ **Domains** de l'application : `https://bilanx.fr` (et `https://www.bilanx.fr`).
3. Mettez `BILANX_APP_URL` à `https://bilanx.fr`, puis **Redeploy**.

Avant d'y accueillir de vraies données de santé : voir `docs/mise-en-production.md` (hébergement certifié HDS,
analyse d'impact, etc.).

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| Le conteneur s'arrête avec « DATABASE_URL manquant » ou « BILANX_SECRET_KEY manquant » | variable absente (étape 3) |
| « BILANX_SECRET_KEY doit faire exactement 32 octets » | clé mal générée : utilisez `openssl rand -base64 32` |
| « BILANX_APP_URL doit être en https » | domaine en http : passez-le en https ou ajoutez `BILANX_ALLOW_INSECURE_HTTP=true` |
| Erreur de connexion à la base au démarrage | utilisez l'adresse **internal** et vérifiez que la base est *Running* |
| Migration `0012_app_role.sql` en échec (« permission denied to create role ») | le compte de `DATABASE_URL` n'est ni superutilisateur ni `CREATEROLE` : utilisez le compte `postgres` de la base Coolify, ou faites créer le rôle `bilanx_app` par l'administrateur de la base |
| « E-mails : serveur SMTP injoignable ou identifiants refusés » | `BILANX_SMTP_URL` erronée, port bloqué par l'hébergeur, ou mot de passe non encodé |
| Clé d'accès refusée ou introuvable sur le téléphone | la clé est liée au domaine de `BILANX_APP_URL` : une clé créée sur le domaine provisoire ne fonctionnera plus après le passage à bilanx.fr (en recréer une) ; le site doit être en https |
| Impossible de rester connecté | `BILANX_APP_URL` ne correspond pas à l'adresse réellement utilisée (http/https, nom de domaine) |
