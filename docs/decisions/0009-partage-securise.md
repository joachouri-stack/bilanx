# Décision 0009 — Partage sécurisé d'un rapport avec un professionnel de santé

**Date** : 5 novembre 2026 · **Statut** : adoptée

## Principe
Le titulaire (ou un proche autorisé en écriture sur le module Rapports) partage **une copie figée** du rapport PDF :
période et rubriques choisies, données arrêtées au moment du partage. Le professionnel n'a pas de compte et ne voit
rien d'autre : ni les données plus récentes, ni les autres rubriques, ni les autres profils.

## Accès
- Lien contenant un jeton aléatoire (256 bits, seule son empreinte SHA-256 est stockée) **et** code à 8 chiffres
  à transmettre par un autre canal (oralement, SMS). Le code est stocké sous forme d'empreinte HMAC liée au partage.
- 5 codes erronés → partage verrouillé. Durée : 24 h, 7 ou 30 jours. Nombre d'ouvertures : illimité, 1, 3 ou 10.
- Après le bon code : consultation de 30 minutes (jeton signé, cookie `HttpOnly`, `SameSite=Strict`, limité au chemin
  du partage). Révocation immédiate, y compris pendant une consultation.
- Page du partage non intégrable ; seul le PDF peut être affiché dans un cadre, par BILANX lui-même.
- Avant le code, la page n'affiche que le prénom, le destinataire, la période et l'échéance : aucune donnée de santé.

## Protection en base (migration 0016)
- Le PDF est chiffré (AES-256-GCM, clé dérivée de la clé maîtresse, lié à l'identifiant du rapport).
- Aucune fonction `SECURITY DEFINER` : le visiteur passe par le rôle applicatif, soumis à la RLS. La transaction
  présente l'empreinte du jeton (`app.share_token_hash`) ; seules les lignes de CE partage sont alors visibles.
  `SELECT … FOR UPDATE` étant interdit au visiteur (il exige un droit de modification), les essais simultanés sont
  sérialisés par un verrou consultatif sur l'empreinte du jeton.
- Journal `share_access` en ajout seul (date, succès, navigateur, empreinte d'IP) ; aucune modification ni suppression
  par l'application. Le titulaire le consulte dans Rapports PDF et reçoit un e-mail à la première consultation.
- Effacement des PDF : immédiat à la révocation ; pour les partages expirés, tâche de fond toutes les 6 h. Elle
  s'annonce (`app.purge = 'on'`) et ne peut qu'**effacer** le PDF d'un rapport dont **tous** les partages sont
  expirés ou révoqués, d'après l'heure du serveur de base de données.

## Limites
- Le site de démonstration étant protégé par mot de passe (`BILANX_BASIC_AUTH`), le professionnel devrait aussi le
  connaître : à ne tester qu'entre soi tant que cette protection est active.
- Pas de vérification de l'identité du professionnel (Pro Santé Connect prévu en V3) : la sécurité repose sur le lien,
  le code transmis séparément, la durée et la révocation.
