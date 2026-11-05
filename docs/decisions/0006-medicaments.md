# Décision 0006 — Médicaments : traitement prescrit, suivi déclaratif et rappels par l'agenda

**Date** : 5 novembre 2026 · **Statut** : adoptée

## Principes
- **Traitement recopié de l'ordonnance** par l'utilisateur (nom, dosage, posologie verbatim, heures de prise,
  période, prescripteur). BILANX ne propose, ne calcule ni ne modifie aucune dose ou horaire.
- **Historique conservé** : un changement décidé par le médecin arrête l'ancienne prescription à la date d'effet
  (jour exclu) et crée la nouvelle (`replaces_id`). « Corriger une erreur de saisie » modifie la ligne sans historique ;
  « Supprimer » (logique) est réservé aux saisies erronées.
- **Arrêt daté** avec motif facultatif ; un arrêt daté du futur laisse le traitement « en cours » jusqu'à la veille.

## Suivi des prises
- Une ligne par prise prévue (unicité `medication_id, scheduled_at`) : « prise » ou « non prise », modifiable et
  annulable. Le serveur refuse une heure qui ne correspond à aucune prise prévue, ou plus d'une heure dans le futur.
- **Une prise non renseignée n'est jamais comptée comme oubliée** : le pourcentage porte sur les prises renseignées,
  et les non renseignées sont affichées à part (page, tableau de bord, rapport PDF).
- Un traitement « si besoin » (sans heure) n'a ni suivi ni rappel.

## Rappels
BILANX n'a pas encore de service de notification. Les rappels passent par un **événement récurrent quotidien**
(.ics, RRULE DAILY jusqu'au dernier jour, fuseau Europe/Paris avec VTIMEZONE, alarme à l'heure de la prise) ajouté
à l'agenda du téléphone. Titre neutre par défaut (« Prise de traitement ») ; le nom du médicament n'est inclus
qu'à la demande. Limite : si le traitement change ou s'arrête, l'utilisateur doit supprimer les rappels de son agenda.

## Accès
Module « medications » (RLS FORCE sur `medication` et `medication_intake`), distinct de l'insuline : un aidant peut
avoir accès à l'un sans l'autre. Données incluses dans l'export RGPD (`medicaments.csv`, `prises-medicaments.csv`)
et, sur demande, dans le rapport PDF.
