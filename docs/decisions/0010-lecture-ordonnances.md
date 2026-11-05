# Décision 0010 — Lecture des ordonnances

**Date** : 5 novembre 2026 · **Statut** : adoptée

## Principe
Une ordonnance déposée dans Documents (PDF ou photo, lecture automatique autorisée) est lue par un analyseur
**déterministe** (`packages/domain/src/prescription-parser.ts`), comme les bilans : aucune IA générative, aucun appel
externe. Les traitements lus sont des **brouillons** (`medication_draft`, migration 0017) ; rien n'est enregistré
avant que l'utilisateur ait confirmé (éventuellement corrigé) ou ignoré **chaque** ligne.

## Ce qui est lu, et ce qui ne l'est jamais
- Prescripteur et date de l'ordonnance (en-tête) ; pour chaque médicament : nom, dosage, posologie **recopiée telle
  quelle**, quantité par prise.
- Heures de prise proposées **uniquement** d'après des mots explicites (matin 08:00, midi 12:00, soir 20:00, coucher
  22:00), signalées comme telles et modifiables. « 3 fois par jour » sans moment : aucune heure inventée, ligne
  signalée (« indiquez les heures vous-même »). « Si besoin » et prises hebdomadaires ou mensuelles : pas d'heure.
- Date de fin calculée seulement à partir d'une durée écrite (« pendant 3 mois ») et de la date de l'ordonnance,
  signalée comme calculée.
- Lecture incertaine d'une photo (confiance < 0,8) signalée.
- Pas de base de médicaments (BDPM) à ce stade : le nom est celui lu sur l'ordonnance, à vérifier par l'utilisateur.

## Ordonnance ou bilan ?
Un document est traité comme une ordonnance s'il en a l'allure (au moins 3 indices : « ordonnance », « Dr », RPPS,
formes galéniques, moments de prise, durée, « renouvelable ») **et** si le lecteur de bilans n'y reconnaît aucune
analyse. Sans cette seconde condition, « METFORMINE 1000 mg » aurait été proposé comme un résultat de laboratoire.

## Validation
Tout ou rien, dans une seule transaction : les traitements confirmés sont créés sous la RLS du module Médicaments
(droit d'écriture exigé, vérifié aussi par l'application), rattachés au document (source « document_extraction »),
et la fiche du médicament renvoie à l'ordonnance d'origine. Une ordonnance validée ne peut pas l'être à nouveau
(pas de doublons).
