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

Pour redéployer après une mise à jour du dépôt : bouton **Redeploy**, ou activez le déploiement automatique sur la
branche `main` (*Webhooks* / *Auto Deploy*).

## Tâches automatiques

L'application efface d'elle-même les comptes dont la suppression est arrivée à échéance (7 jours) et les profils
supprimés depuis plus de 30 jours : 1 minute après chaque démarrage, puis toutes les 6 heures. Rien à configurer.

## 5. Créer votre compte

Aucun service d'envoi d'e-mails n'est encore branché : **les e-mails s'affichent dans les journaux de l'application**.

1. Ouvrez le site (identifiant et mot de passe de `BILANX_BASIC_AUTH`), puis **Créer un compte**.
2. Dans Coolify, onglet **Logs** de l'application : cherchez le message « Confirmez votre adresse e-mail BILANX » et
   ouvrez le lien `…/verifier-email?jeton=…` qu'il contient.
3. Connectez-vous et configurez la double authentification avec une application d'authentification sur votre
   téléphone. Conservez les codes de secours.

Les invitations envoyées depuis *Famille & Profils* apparaissent de la même façon dans les journaux.

## 6. Plus tard : brancher bilanx.fr

1. Dans la zone DNS de votre domaine chez Hostinger, créez un enregistrement **A** pour `@` (et `www` si souhaité)
   pointant vers l'adresse IP de votre VPS.
2. Dans Coolify, champ **Domains** de l'application : `https://bilanx.fr` (et `https://www.bilanx.fr`).
3. Mettez `BILANX_APP_URL` à `https://bilanx.fr`, puis **Redeploy**.

Avant d'y accueillir de vraies données de santé : hébergement certifié HDS, analyse d'impact (AIPD), prestataire
d'e-mails, voir `docs/08-securite-conformite.md`.

## En cas de problème

| Symptôme | Cause probable |
|---|---|
| Le conteneur s'arrête avec « DATABASE_URL manquant » ou « BILANX_SECRET_KEY manquant » | variable absente (étape 3) |
| « BILANX_SECRET_KEY doit faire exactement 32 octets » | clé mal générée : utilisez `openssl rand -base64 32` |
| « BILANX_APP_URL doit être en https » | domaine en http : passez-le en https ou ajoutez `BILANX_ALLOW_INSECURE_HTTP=true` |
| Erreur de connexion à la base au démarrage | utilisez l'adresse **internal** et vérifiez que la base est *Running* |
| Impossible de rester connecté | `BILANX_APP_URL` ne correspond pas à l'adresse réellement utilisée (http/https, nom de domaine) |
