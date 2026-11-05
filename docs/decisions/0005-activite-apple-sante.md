# Décision 0005 — Pas : import de l'export Apple Santé (avant l'application iPhone)

**Date** : 5 novembre 2026 · **Statut** : adoptée

## Pourquoi
Une page web (PWA) ne peut pas lire HealthKit. L'application iPhone compagnon (V2) nécessite un Mac et Xcode pour être
construite et testée. En attendant, l'app Santé permet à l'utilisateur d'exporter toutes ses données (export.zip) :
BILANX importe les pas de ce fichier. C'est un **import de fichier**, présenté comme tel (date du dernier import,
« aucune synchronisation automatique »).

## Fonctionnement
- Fichier envoyé brut et **lu en flux** côté serveur (ZIP → `export.xml` ou `exportation.xml`) : un export de plusieurs
  centaines de Mo ne passe jamais entièrement en mémoire. Mesuré : 34 Mo de XML (2 ans, montre + iPhone) en ~3 s.
- Seuls les `HKQuantityTypeIdentifierStepCount` sont lus ; le reste est ignoré ; le fichier n'est pas conservé.
- Agrégation par heure ; échantillon à cheval réparti au prorata ; heures de Paris pour les jours.
- **Dédoublonnage iPhone / Apple Watch** : par heure, la source qui a compté le plus (pas d'addition). Approximation
  de la priorité des sources d'Apple Santé, signalée dans l'interface et le rapport.
- Ré-import idempotent : les heures sont remplacées, les jours recalculés.
- Échantillons futurs ou de plus de 10 ans ignorés. Jours sans donnée affichés vides, jamais à 0.

## Limites connues
- Format testé sur des exports **synthétiques** conformes au format documenté d'Apple ; à valider sur un export réel
  (formats de date, variantes de noms de fichier selon la langue).
- Totaux pouvant différer légèrement de ceux affichés par l'app Santé (méthode de dédoublonnage différente).
