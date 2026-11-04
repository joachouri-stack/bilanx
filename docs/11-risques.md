# 11 — Risques techniques, réglementaires et commerciaux

Échelle : Probabilité (P) et Impact (I) de 1 à 3.

## 11.1 Techniques

| Risque | P | I | Mitigation |
|---|---|---|---|
| Erreurs d'extraction IA (virgule décimale, unité, ligne décalée) | 3 | 3 | Validation humaine obligatoire, vérification littérale dans l'OCR, contrôles déterministes de plausibilité, surlignage source, jeu de test de 50+ formats, métriques par laboratoire |
| Hallucination d'une valeur absente | 2 | 3 | Rejet automatique de toute valeur non retrouvée dans le texte, JSON contraint, `null` explicite |
| Changement du format d'export LibreView | 2 | 2 | Parseur tolérant + détection de format, tests de non-régression, message d'erreur clair |
| Doublons et fuseaux horaires (changement d'heure, voyages) | 2 | 2 | Stockage UTC + fuseau source, clés uniques, tests sur les nuits de changement d'heure |
| Performances des graphiques 90 j | 1 | 2 | Agrégats précalculés, percentiles horaires, ECharts |
| Limitations PWA iOS (push, caméra, stockage) | 2 | 2 | Fonctionnalités dégradées acceptables + app iOS en V2 |
| Sync HealthKit retardée par iOS | 3 | 1 | Afficher « dernière synchronisation », pas de promesse temps réel |
| Fuite inter-profils par bug d'autorisation | 1 | 3 | RLS + guards + tests automatisés de la matrice + pentest |

## 11.2 Réglementaires et juridiques

| Risque | P | I | Mitigation |
|---|---|---|---|
| Requalification en dispositif médical (assistant IA, alertes, « à surveiller ») | 2 | 3 | Destination d'usage stricte, revue réglementaire de chaque fonctionnalité, libellés factuels, pas d'interprétation |
| Non-conformité HDS d'un sous-traitant (IA, e-mails, logs) | 2 | 3 | Cartographie des flux, attestations HDS, aucune donnée de santé dans e-mails/logs |
| Violation de données | 1 | 3 | Défense en profondeur, chiffrement applicatif, plan de réponse, assurance cyber |
| Accès aidant contesté (personne majeure non consentante) | 2 | 3 | Invitation + consentement, base légale déclarée, révocation, journal visible |
| Transferts hors UE (fournisseur IA / cloud US) | 2 | 2 | Fournisseurs UE ou régions UE + clauses ; préférence acteurs européens |
| Responsabilité en cas de mauvaise interprétation par l'utilisateur | 2 | 2 | Mentions claires, contenus relus par médecin, renvoi vers le médecin, CGU |
| Utilisation de LibreLinkUp ou API non autorisées | — | 3 | Exclues par décision produit |

## 11.3 Commerciaux

| Risque | P | I | Mitigation |
|---|---|---|---|
| Concurrence de Mon Espace Santé (gratuit, public) | 2 | 2 | Se positionner en complément : visualisation, extraction, famille ; viser l'interopérabilité V3 |
| Effort de saisie trop élevé → abandon | 3 | 3 | Scanner en 3 gestes, onboarding orienté objectif, valeur immédiate dès le 1er bilan |
| Confiance (données de santé) | 2 | 3 | Hébergement HDS français, transparence, pas de publicité, page sécurité publique |
| Willingness-to-pay faible | 2 | 2 | Freemium, offre Famille, partenariats associations / mutuelles (sans partage de données) |
| Dépendance à Abbott / Apple | 2 | 2 | Valeur indépendante des intégrations (biologie, documents), imports de fichiers |
| Coûts IA au-delà des prévisions | 1 | 2 | Couche texte PDF d'abord (gratuit), modèles adaptés à la tâche, quotas, cache |
