# 03 — Structure de la base de données

Le schéma exécutable se trouve dans [`db/migrations/`](../db/migrations/) (fichiers SQL appliqués dans l’ordre) (PostgreSQL 16, testé : chargement sans
erreur, 35 tables dont la partition par défaut de la glycémie).

## 3.1 Domaines

```
IDENTITÉ & SÉCURITÉ        PROFILS & ACCÈS              DOCUMENTS & IA
account ─┬─ mfa_factor      profile ─┬─ profile_access   document ── extraction_job ── extracted_value_draft
         ├─ session                  ├─ access_invitation                                   │ (confirmation)
         ├─ login_event              ├─ consent                                             ▼
         └─ consent                  ├─ profile_module                                   lab_result ── analyte
audit_log (append-only, chaîné)      └─ dashboard_module

GLYCÉMIE                    INSULINE & TRAITEMENTS       JOURNAL / ACTIVITÉ / RDV / RAPPORTS
glucose_source              insulin_product              journal_entry
glucose_reading (partit.)   insulin_dose                 activity_source, activity_hourly, activity_daily, activity_goal
glucose_target              treatment_change             appointment, appointment_link
glucose_daily_stats         medication, medication_intake report, share_link
```

## 3.2 Décisions de modélisation importantes

| Exigence du cahier des charges | Traduction dans le schéma |
|---|---|
| Profils entièrement séparés | `profile_id` sur toutes les tables de santé + **RLS forcée** via `app_can_access()` |
| Rôles différenciés, révocation, traçabilité | `profile_access.role`, `permissions` par module, `revoked_at`, `expires_at`, `legal_basis` ; `audit_log` immuable |
| Pas d'accès aidant automatique | Accès créé uniquement via `access_invitation` acceptée + `consent` ou base légale documentée |
| Ne pas confondre capteur / capillaire / labo | `glucose_reading.kind` ; HbA1c en `lab_result` (jamais dans `glucose_reading`) |
| Source et date de dernière synchro | `glucose_source.status` + `last_sync_at` ; idem `activity_source` |
| IA jamais enregistrée sans validation | `extracted_value_draft` (brouillon) ≠ `lab_result` ; `lab_result.confirmed_by NOT NULL` |
| Lien valeur ↔ document source | `lab_result.document_id`, `draft_id` → `page` + `bbox` |
| Références propres au laboratoire | `ref_low` / `ref_high` / `ref_text` **par résultat**, pas seulement par analyte |
| Pas de résultats inventés | Un point de graphique = une ligne `lab_result` à sa `sampled_at` réelle |
| Traitement extrait par IA confirmé avant activation | `CHECK (status <> 'active' OR confirmed_by IS NOT NULL)` et rappels seulement si actif |
| Modifications prescrites, sans recommandation | `treatment_change` déclaratif (`prescribed_by`, `goal_note`) |
| Données fictives identifiées | `profile.is_demo`, `data_source_type = 'demo'` |
| Données saisies manuellement identifiées | `source_type = 'manual'` partout, repris dans le rapport PDF |
| Dédoublonnage ré-import LibreView | Clé primaire `(profile_id, kind, measured_at)` + `ON CONFLICT DO NOTHING` |
| Dédoublonnage iPhone / Watch | Stockage des statistiques HealthKit déjà agrégées (`activity_hourly`) |

## 3.3 Catalogue initial des analytes (extrait)

| code | Nom | Unité canonique | Conversions courantes | Catégorie |
|---|---|---|---|---|
| `hba1c` | HbA1c | % (NGSP) | mmol/mol = (% − 2,15) × 10,929 | diabète |
| `glucose_fasting` | Glycémie à jeun | g/L | mmol/L × 0,18016 = g/L ; mg/dL ÷ 100 | diabète |
| `ferritin` | Ferritine | µg/L | ng/mL × 1 | fer |
| `iron_serum` | Fer sérique | µmol/L | µg/dL × 0,179 | fer |
| `hemoglobin` | Hémoglobine | g/dL | g/L ÷ 10 | hématologie |
| `vitamin_d_25oh` | Vitamine D (25-OH) | ng/mL | nmol/L × 0,4006 | vitamines |
| `vitamin_b12` | Vitamine B12 | pmol/L | pg/mL × 0,738 | vitamines |
| `folate` | Folates | ng/mL | nmol/L × 0,441 | vitamines |
| `magnesium` | Magnésium | mmol/L | mg/L × 0,0411 | minéraux |
| `calcium` | Calcium | mmol/L | mg/L × 0,02495 | minéraux |
| `zinc` | Zinc | µmol/L | µg/dL × 0,153 | minéraux |
| `potassium` | Potassium | mmol/L | — | ionogramme |
| `sodium` | Sodium | mmol/L | — | ionogramme |
| `creatinine` | Créatinine | µmol/L | mg/L × 8,84 | rein |
| `egfr` | DFG estimé | mL/min/1,73 m² | — (préciser l'équation : CKD-EPI) | rein |
| `cholesterol_total` | Cholestérol total | g/L | mmol/L × 0,3867 | lipides |
| `ldl` / `hdl` | LDL / HDL | g/L | mmol/L × 0,3867 | lipides |
| `triglycerides` | Triglycérides | g/L | mmol/L × 0,8857 | lipides |
| `tsh` | TSH | mUI/L | — | thyroïde |
| `testosterone_total` | Testostérone | nmol/L | ng/mL × 3,467 | hormones |
| `crp` | CRP | mg/L | — | inflammation |

> Les facteurs de conversion sont à **faire valider par un biologiste** avant mise en production et testés
> unitairement. En cas de doute, BILANX conserve la valeur et l'unité du laboratoire sans conversion.

## 3.4 Rétention

| Donnée | Durée |
|---|---|
| Données de santé d'un compte actif | Tant que le compte est actif |
| Après demande de suppression | Suppression logique immédiate (inaccessible), purge physique ≤ 30 jours, sauvegardes expirées selon leur cycle (≤ 35 jours) |
| Compte inactif | Alerte à 24 mois, suppression à 36 mois sans réponse (à valider dans la politique de conservation) |
| `audit_log` | Durée à fixer avec le DPO (ex. 1 à 3 ans), sans donnée de santé |
| Fichiers temporaires OCR / IA | Supprimés dès la fin du traitement |
