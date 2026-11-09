-- =====================================================================
-- BILANX — Migration 0032 : catalogue étendu (bilan standard : NFS, rein, foie, protéines, ions)
-- Ajouté depuis packages/domain/src/analytes.ts (source de vérité). Bornes « plausibles » = détection d'erreurs de lecture.
-- ⚠️ Facteurs de conversion à faire valider par un biologiste.
-- =====================================================================
INSERT INTO analyte (code, name_fr, synonyms, category, canonical_unit, unit_conversions, plausible_min, plausible_max) VALUES
  ('leukocytes', 'Leucocytes', ARRAY['leucocytes', 'globules blancs', 'gb', 'leucocyte']::text[], 'hematology', 'G/L', '[{"unit":"/mm3","factor":0.001},{"unit":"10*9/L","factor":1},{"unit":"giga/L","factor":1},{"unit":"10^9/L","factor":1}]'::jsonb, 0.1, 500),
  ('erythrocytes', 'Hématies', ARRAY['hématies', 'hematies', 'globules rouges', 'gr', 'érythrocytes', 'erythrocytes']::text[], 'hematology', 'T/L', '[{"unit":"10*12/L","factor":1},{"unit":"10^12/L","factor":1},{"unit":"tera/L","factor":1},{"unit":"M/mm3","factor":1},{"unit":"/mm3","factor":1e-06}]'::jsonb, 0.5, 10),
  ('hematocrit', 'Hématocrite', ARRAY['hématocrite', 'hematocrite', 'ht']::text[], 'hematology', '%', '[{"unit":"L/L","factor":100}]'::jsonb, 5, 80),
  ('mcv', 'VGM', ARRAY['vgm', 'v.g.m', 'v.g.m.', 'volume globulaire moyen']::text[], 'hematology', 'fL', '[{"unit":"µ3","factor":1},{"unit":"fl","factor":1}]'::jsonb, 40, 150),
  ('mch', 'TCMH', ARRAY['tcmh', 't.c.m.h', 't.c.m.h.', 'teneur corpusculaire moyenne en hémoglobine', 'tgmh']::text[], 'hematology', 'pg', '[]'::jsonb, 10, 60),
  ('mchc', 'CCMH', ARRAY['ccmh', 'c.c.m.h', 'c.c.m.h.', 'concentration corpusculaire moyenne en hémoglobine']::text[], 'hematology', 'g/dL', '[{"unit":"g/L","factor":0.1},{"unit":"%","factor":1}]'::jsonb, 20, 45),
  ('platelets', 'Plaquettes', ARRAY['plaquettes', 'thrombocytes', 'numération plaquettaire']::text[], 'hematology', 'G/L', '[{"unit":"/mm3","factor":0.001},{"unit":"10*9/L","factor":1},{"unit":"giga/L","factor":1},{"unit":"10^9/L","factor":1}]'::jsonb, 1, 2000),
  ('neutrophils', 'Polynucléaires neutrophiles', ARRAY['polynucléaires neutrophiles', 'polynucleaires neutrophiles', 'neutrophiles', 'pnn']::text[], 'hematology', 'G/L', '[{"unit":"/mm3","factor":0.001},{"unit":"10*9/L","factor":1},{"unit":"giga/L","factor":1}]'::jsonb, 0, 100),
  ('lymphocytes', 'Lymphocytes', ARRAY['lymphocytes']::text[], 'hematology', 'G/L', '[{"unit":"/mm3","factor":0.001},{"unit":"10*9/L","factor":1},{"unit":"giga/L","factor":1}]'::jsonb, 0, 100),
  ('monocytes', 'Monocytes', ARRAY['monocytes']::text[], 'hematology', 'G/L', '[{"unit":"/mm3","factor":0.001},{"unit":"10*9/L","factor":1},{"unit":"giga/L","factor":1}]'::jsonb, 0, 50),
  ('eosinophils', 'Polynucléaires éosinophiles', ARRAY['polynucléaires éosinophiles', 'polynucleaires eosinophiles', 'éosinophiles', 'eosinophiles']::text[], 'hematology', 'G/L', '[{"unit":"/mm3","factor":0.001},{"unit":"10*9/L","factor":1},{"unit":"giga/L","factor":1}]'::jsonb, 0, 50),
  ('basophils', 'Polynucléaires basophiles', ARRAY['polynucléaires basophiles', 'polynucleaires basophiles', 'basophiles']::text[], 'hematology', 'G/L', '[{"unit":"/mm3","factor":0.001},{"unit":"10*9/L","factor":1},{"unit":"giga/L","factor":1}]'::jsonb, 0, 20),
  ('urea', 'Urée', ARRAY['urée', 'uree', 'urémie', 'uremie', 'urée sanguine']::text[], 'kidney', 'mmol/L', '[{"unit":"g/L","factor":16.65},{"unit":"mg/dL","factor":0.1665}]'::jsonb, 0.5, 80),
  ('uric_acid', 'Acide urique', ARRAY['acide urique', 'uricémie', 'uricemie']::text[], 'kidney', 'µmol/L', '[{"unit":"mg/L","factor":5.948},{"unit":"mg/dL","factor":59.48}]'::jsonb, 30, 1500),
  ('ast', 'ASAT (TGO)', ARRAY['asat', 'tgo', 'aspartate aminotransférase', 'transaminases asat', 'sgot']::text[], 'liver', 'UI/L', '[{"unit":"U/L","factor":1}]'::jsonb, 1, 10000),
  ('alt', 'ALAT (TGP)', ARRAY['alat', 'tgp', 'alanine aminotransférase', 'transaminases alat', 'sgpt']::text[], 'liver', 'UI/L', '[{"unit":"U/L","factor":1}]'::jsonb, 1, 10000),
  ('ggt', 'Gamma-GT', ARRAY['gamma gt', 'gamma-gt', 'ggt', 'gamma glutamyl transférase', 'γgt']::text[], 'liver', 'UI/L', '[{"unit":"U/L","factor":1}]'::jsonb, 1, 10000),
  ('alp', 'Phosphatases alcalines', ARRAY['phosphatases alcalines', 'pal']::text[], 'liver', 'UI/L', '[{"unit":"U/L","factor":1}]'::jsonb, 5, 5000),
  ('bilirubin_total', 'Bilirubine totale', ARRAY['bilirubine totale', 'bilirubine']::text[], 'liver', 'µmol/L', '[{"unit":"mg/L","factor":1.71},{"unit":"mg/dL","factor":17.1}]'::jsonb, 1, 1000),
  ('albumin', 'Albumine', ARRAY['albumine', 'albuminémie', 'albuminemie']::text[], 'proteins', 'g/L', '[{"unit":"g/dL","factor":10}]'::jsonb, 5, 70),
  ('protein_total', 'Protides totaux', ARRAY['protides totaux', 'protéines totales', 'proteines totales', 'protidémie', 'protidemie']::text[], 'proteins', 'g/L', '[{"unit":"g/dL","factor":10}]'::jsonb, 20, 140),
  ('chloride', 'Chlore', ARRAY['chlore', 'chlorémie', 'chloremie', 'chlorures']::text[], 'electrolytes', 'mmol/L', '[]'::jsonb, 60, 150),
  ('phosphorus', 'Phosphore', ARRAY['phosphore', 'phosphorémie', 'phosphoremie', 'phosphates']::text[], 'minerals', 'mmol/L', '[{"unit":"mg/L","factor":0.0323}]'::jsonb, 0.1, 5)
ON CONFLICT (code) DO NOTHING;
