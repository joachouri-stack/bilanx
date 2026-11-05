# Tests de bout en bout

Parcours réels dans Chromium, contre le serveur de production et une vraie base PostgreSQL : comptes et double
authentification, famille, analyses, documents (lecture des bilans et des ordonnances, OCR compris), insuline,
journal, rendez-vous, rapports PDF, droits RGPD, activité, médicaments, rappels par notification, partage avec un
professionnel, clés d'accès, application installable, unités, et audit d'accessibilité (axe-core, WCAG 2.2 AA,
clair/sombre, ordinateur/téléphone).

```bash
npm run build -w @bilanx/web
npm run e2e                           # tous les scénarios (≈ 15 min)
npm run e2e -- medicaments partage    # seulement ceux-là
```

- **Base** : `DATABASE_URL` et `BILANX_SECRET_KEY` (environnement ou `apps/web/.env.local`). Une base de
  **développement** : les scénarios y créent des comptes de test (adresses `…+horodatage@exemple.fr`) et y lisent
  parfois directement (`psql` requis), avec un compte qui voit toutes les lignes (propriétaire des tables).
- **Données** : toutes fictives — bilan et ordonnance de `packages/documents/test/fixtures/`, export Apple Santé
  généré à chaque exécution (`fixtures/gen-apple-health.mjs`).
- **E-mails** : sans `BILANX_SMTP_URL`, le serveur les écrit dans son journal ; les scénarios y lisent les liens.
- **Notifications** : le scénario « rappels » démarre un service de notification simulé (HTTPS, certificat de test
  généré), qui déchiffre réellement les messages reçus.
- **Résultats** : `apps/web/e2e/.resultats/` (sortie de chaque scénario, journal du serveur, captures des échecs).
