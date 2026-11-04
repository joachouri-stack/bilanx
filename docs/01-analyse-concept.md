# 01 — Analyse complète du concept BILANX

## 1.1 Le problème

Les données de santé d'un particulier sont dispersées :

- **Bilans biologiques** en PDF dans des e-mails, sur les portails de chaque laboratoire, ou sur papier.
- **Glycémie** dans LibreView / LibreLink, avec une lecture surtout orientée « capteur » et peu reliée au reste.
- **HbA1c** noyée dans les bilans, rarement visualisée dans le temps.
- **Pas et activité** dans Apple Santé, invisibles pour le médecin.
- **Traitements et insuline** dans des carnets papier ou des notes.
- **Rendez-vous** dans un agenda personnel, sans lien avec les documents à apporter.
- **Proches aidés** (parents âgés, enfants) : informations éparpillées, aucun outil partagé avec traçabilité.

Conséquence : le patient arrive en consultation sans vue d'ensemble, l'aidant manque d'outils, et la compréhension
de l'évolution des résultats est faible.

## 1.2 La proposition de valeur

> **Un seul tableau de bord, compréhensible, qui montre l'évolution réelle des données de santé, avec leur source.**

Trois piliers :

1. **Centraliser** — importer, scanner, saisir ; une seule chronologie par personne.
2. **Comprendre** — visualisations honnêtes (jauges reliées aux références du laboratoire, points uniquement aux dates
   réelles d'analyse), explications pédagogiques, assistant qui cite ses sources.
3. **Préparer la consultation** — rapport PDF structuré, partage contrôlé, liste « à discuter avec mon médecin ».

Ce que BILANX **n'est pas** : un outil de diagnostic, de prescription, de calcul de dose, de télésurveillance ou
d'alerte médicale en temps réel. Cette limite est un choix produit **et** réglementaire (voir doc 08).

## 1.3 Segments et besoins

| Segment | Besoin principal | Modules activés par défaut | Fréquence d'usage |
|---|---|---|---|
| Particulier « bilan annuel » | Comprendre et suivre ses analyses | Biologie, Documents, RDV | Mensuelle |
| Personne avec carences (fer, vit. D, B12) | Suivre la correction dans le temps | Biologie, Traitements, Documents | Mensuelle |
| Diabète type 1 / type 2 insuliné | Glycémie + insuline + repas + HbA1c | Glycémie, HbA1c, Insuline, Journal | Quotidienne |
| Diabète type 2 non insuliné | HbA1c, activité, poids, traitements | HbA1c, Activité, Traitements | Hebdomadaire |
| Polymédiqué / senior | Traitements, rendez-vous, ordonnances | Traitements, RDV, Documents | Quotidienne |
| Aidant familial | Vue claire des proches, documents, RDV | Famille + modules du proche | Hebdomadaire |
| Utilisateur Apple Watch | Pas + contexte santé | Activité | Quotidienne |

**Décision produit clé** : à l'inscription, un court questionnaire (« Que souhaitez-vous suivre ? ») active les modules
pertinents. Le tableau de bord d'une personne non diabétique ne montre ni glycémie ni insuline.

## 1.4 Différenciation

| Acteur existant | Limite | Différenciation BILANX |
|---|---|---|
| Mon Espace Santé (public) | Stockage documentaire, peu de visualisation des valeurs | Extraction des valeurs, graphiques, suivi familial |
| Portails laboratoires | Un portail par laboratoire, pas d'historique transversal | Historique multi-laboratoires |
| LibreView / LibreLink | Centré capteur, peu de contexte (biologie, documents) | Glycémie + HbA1c labo + insuline + repas + documents |
| Apple Santé | Pas de lecture des bilans PDF, pas de rapport médecin | Rapport PDF consultation, IA d'extraction |
| Carnets diabète (mySugr, etc.) | Centrés diabète | Plateforme santé globale et familiale |

## 1.5 Modèle économique envisagé (à valider)

- **Gratuit** : 1 profil, documents limités (ex. 20), biologie, journal, RDV.
- **Premium (≈ 4,99–7,99 €/mois)** : scans IA illimités, rapports PDF, assistant IA, import LibreView, historique illimité.
- **Famille (≈ 9,99–12,99 €/mois)** : jusqu'à 5–6 profils, aidants, partage.
- **B2B2C (V3)** : associations de patients, mutuelles, réseaux de soins — sans revente de données.

Principe non négociable : **pas de publicité ciblée, pas de revente ni d'exploitation commerciale des données de santé**.

## 1.6 Principes directeurs (issus du cahier des charges)

1. Ne jamais inventer de donnée ; toute valeur a une **source** (document, import, saisie manuelle, appareil).
2. Toute extraction IA est un **brouillon** tant qu'elle n'est pas confirmée.
3. Distinguer visuellement : laboratoire / capteur / capillaire / estimation / saisie manuelle.
4. Afficher l'état réel des synchronisations (« Non connecté », « Dernier import le … »).
5. Aucune recommandation thérapeutique, aucun calcul de dose.
6. Sobriété du tableau de bord : seuls les modules utiles.
7. Sécurité et conformité dès le MVP.

## 1.7 Conclusion de l'analyse

Le concept est **viable et différenciant** à condition de :

- démarrer sur ce qui est réellement maîtrisable (web/PWA, imports de fichiers, extraction IA validée) ;
- traiter l'hébergement HDS, le RGPD et la qualification réglementaire **avant** l'ouverture publique ;
- accepter que Apple Watch et Android exigent des applications natives (V2) ;
- considérer toute synchronisation Abbott automatique comme **conditionnée à un partenariat**.
