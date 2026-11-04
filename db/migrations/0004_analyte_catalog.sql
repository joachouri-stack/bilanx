-- =====================================================================
-- BILANX — Migration 0004 : catalogue initial des paramètres biologiques
-- Généré depuis packages/domain/src/analytes.ts (source de vérité, testée).
-- Les bornes « plausibles » servent uniquement à détecter des erreurs de
-- lecture ; ce ne sont PAS des valeurs de référence.
-- ⚠️ Facteurs de conversion à faire valider par un biologiste.
-- =====================================================================
INSERT INTO analyte (code, name_fr, synonyms, category, canonical_unit, unit_conversions, plausible_min, plausible_max) VALUES
  ('hba1c', 'HbA1c', ARRAY['hémoglobine glyquée', 'hemoglobine glyquee', 'hba1c', 'a1c', 'hémoglobine a1c']::text[], 'diabetes', '%', '[]'::jsonb, 3, 20),
  ('glucose_fasting', 'Glycémie à jeun', ARRAY['glycémie à jeun', 'glycemie a jeun', 'glucose', 'glycémie']::text[], 'diabetes', 'g/L', '[{"unit":"mmol/L","factor":0.18016},{"unit":"mg/dL","factor":0.01}]'::jsonb, 0.2, 7),
  ('ferritin', 'Ferritine', ARRAY['ferritine', 'ferritinémie', 'ferritinemie', 'ferritine sérique']::text[], 'iron', 'µg/L', '[{"unit":"ng/mL","factor":1}]'::jsonb, 0.5, 100000),
  ('iron_serum', 'Fer sérique', ARRAY['fer sérique', 'fer serique', 'sidérémie', 'fer']::text[], 'iron', 'µmol/L', '[{"unit":"µg/dL","factor":0.179}]'::jsonb, 0.5, 150),
  ('hemoglobin', 'Hémoglobine', ARRAY['hémoglobine', 'hemoglobine', 'hb']::text[], 'hematology', 'g/dL', '[{"unit":"g/L","factor":0.1}]'::jsonb, 2, 25),
  ('vitamin_d_25oh', 'Vitamine D (25-OH)', ARRAY['vitamine d', '25-oh vitamine d', '25 oh vitamine d', '25-hydroxyvitamine d', '25(oh)d', 'vitamine d totale']::text[], 'vitamins', 'ng/mL', '[{"unit":"nmol/L","factor":0.4006}]'::jsonb, 1, 300),
  ('vitamin_b12', 'Vitamine B12', ARRAY['vitamine b12', 'cobalamine', 'b12']::text[], 'vitamins', 'pmol/L', '[{"unit":"pg/mL","factor":0.738},{"unit":"ng/L","factor":0.738}]'::jsonb, 20, 5000),
  ('folate', 'Folates', ARRAY['folates', 'acide folique', 'vitamine b9', 'folates sériques']::text[], 'vitamins', 'ng/mL', '[{"unit":"nmol/L","factor":0.441},{"unit":"µg/L","factor":1}]'::jsonb, 0.3, 100),
  ('magnesium', 'Magnésium', ARRAY['magnésium', 'magnesium', 'magnésémie', 'mg sérique']::text[], 'minerals', 'mmol/L', '[{"unit":"mg/L","factor":0.0411}]'::jsonb, 0.2, 4),
  ('calcium', 'Calcium', ARRAY['calcium', 'calcémie', 'calcemie']::text[], 'minerals', 'mmol/L', '[{"unit":"mg/L","factor":0.02495}]'::jsonb, 1, 5),
  ('zinc', 'Zinc', ARRAY['zinc', 'zincémie']::text[], 'minerals', 'µmol/L', '[{"unit":"µg/dL","factor":0.153}]'::jsonb, 2, 60),
  ('potassium', 'Potassium', ARRAY['potassium', 'kaliémie', 'kaliemie', 'k+']::text[], 'electrolytes', 'mmol/L', '[]'::jsonb, 1, 10),
  ('sodium', 'Sodium', ARRAY['sodium', 'natrémie', 'natremie', 'na+']::text[], 'electrolytes', 'mmol/L', '[]'::jsonb, 100, 180),
  ('creatinine', 'Créatinine', ARRAY['créatinine', 'creatinine', 'créatininémie']::text[], 'kidney', 'µmol/L', '[{"unit":"mg/L","factor":8.84}]'::jsonb, 5, 2000),
  ('egfr', 'DFG estimé', ARRAY['dfg', 'débit de filtration glomérulaire', 'ckd-epi', 'dfg estimé']::text[], 'kidney', 'mL/min/1,73m²', '[]'::jsonb, 1, 200),
  ('cholesterol_total', 'Cholestérol total', ARRAY['cholestérol total', 'cholesterol total']::text[], 'lipids', 'g/L', '[{"unit":"mmol/L","factor":0.3867}]'::jsonb, 0.5, 10),
  ('ldl', 'Cholestérol LDL', ARRAY['ldl', 'ldl-cholestérol', 'cholestérol ldl', 'ldl calculé']::text[], 'lipids', 'g/L', '[{"unit":"mmol/L","factor":0.3867}]'::jsonb, 0.1, 8),
  ('hdl', 'Cholestérol HDL', ARRAY['hdl', 'hdl-cholestérol', 'cholestérol hdl']::text[], 'lipids', 'g/L', '[{"unit":"mmol/L","factor":0.3867}]'::jsonb, 0.05, 3),
  ('triglycerides', 'Triglycérides', ARRAY['triglycérides', 'triglycerides', 'tg']::text[], 'lipids', 'g/L', '[{"unit":"mmol/L","factor":0.8857}]'::jsonb, 0.1, 50),
  ('tsh', 'TSH', ARRAY['tsh', 'thyréostimuline', 'tsh us']::text[], 'thyroid', 'mUI/L', '[{"unit":"µUI/mL","factor":1}]'::jsonb, 0.001, 500),
  ('testosterone_total', 'Testostérone totale', ARRAY['testostérone', 'testosterone', 'testostérone totale']::text[], 'hormones', 'nmol/L', '[{"unit":"ng/mL","factor":3.467}]'::jsonb, 0.05, 100),
  ('crp', 'CRP', ARRAY['crp', 'protéine c réactive', 'proteine c reactive', 'crp us']::text[], 'inflammation', 'mg/L', '[]'::jsonb, 0, 600)
ON CONFLICT (code) DO NOTHING;
