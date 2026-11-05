# Décision 0011 — Rappels de prise par notification (Web Push)

**Date** : 5 novembre 2026 · **Statut** : adoptée

## Principe
À chaque heure de prise prévue, une notification arrive sur les appareils où l'utilisateur a activé les rappels
(Médicaments → « Rappels sur ce téléphone »), même BILANX fermé. Pas de rappel si la prise est déjà notée. Un compte
aidant peut recevoir les rappels d'un proche dont il peut lire les médicaments. Les rappels par l'agenda (.ics)
restent disponibles.

## Fonctionnement
- Web Push standard (RFC 8030, 8291, 8292), bibliothèque `web-push` pour le chiffrement et la signature ; envoi
  par `fetch`, en HTTPS uniquement. Clés du serveur (VAPID) dérivées de `BILANX_SECRET_KEY` : rien à configurer.
- Contenu chiffré de bout en bout : le service de notification (Google, Apple, Mozilla) ne le lit pas.
- **Écran verrouillé** : par défaut « Prise de traitement — Prise prévue à 08 h 00 », sans nom de médicament ;
  le nom n'apparaît que si l'utilisateur coche l'option.
- Tâche de fond chaque minute : prises dont l'heure est passée depuis moins de 10 minutes. Lecture des traitements
  **au nom du compte destinataire** (RLS du module Médicaments) : un accès retiré arrête les rappels et supprime la
  préférence. Un seul envoi par prise et par compte (`reminder_sent`), même avec plusieurs instances.
- Appareils expirés (réponse 404/410) supprimés ; suppression après 20 échecs consécutifs.
- RGPD : appareils et préférences dans l'export (`compte.json`) ; effacés à la suppression du compte (le compte étant
  anonymisé et non supprimé, l'effacement est explicite).

## Limites
- iPhone : notifications seulement si BILANX est installé sur l'écran d'accueil (iOS 16.4 ou plus) ; la page le dit.
- Le site doit être en https.
- Testé ici avec un service de notification simulé (réception et déchiffrement réels) et l'affichage par le service
  worker dans Chromium ; l'envoi vers les vrais services (Google, Apple, Mozilla) reste à vérifier sur le site déployé
  avec « Envoyer une notification de test ».
