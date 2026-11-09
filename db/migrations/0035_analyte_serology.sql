-- =====================================================================
-- BILANX — Migration 0035 : catalogue « Virus & sérologies »
-- Ajouté depuis packages/domain/src/analytes.ts (source de vérité). Bornes « plausibles » = détection d'erreurs de lecture.
-- Résultats chiffrés uniquement (index, titre d'anticorps, charge virale) : la conclusion « positif / négatif »
-- du laboratoire se note dans le commentaire du résultat.
-- =====================================================================
INSERT INTO analyte (code, name_fr, synonyms, category, canonical_unit, unit_conversions, plausible_min, plausible_max) VALUES
  ('anti_hbs', 'Anticorps anti-HBs (hépatite B)', ARRAY['anticorps anti-hbs', 'ac anti-hbs', 'ac anti hbs', 'anti-hbs', 'anticorps anti hbs']::text[], 'serology', 'mUI/mL', '[{"unit":"UI/L","factor":1}]'::jsonb, 0, 100000),
  ('hbs_ag', 'Antigène HBs (hépatite B)', ARRAY['antigène hbs', 'antigene hbs', 'ag hbs', 'aghbs', 'ag hbs quantitatif']::text[], 'serology', 'index', '[{"unit":"S/CO","factor":1},{"unit":"COI","factor":1}]'::jsonb, 0, 100000),
  ('anti_hbc', 'Anticorps anti-HBc (hépatite B)', ARRAY['anticorps anti-hbc', 'ac anti-hbc', 'ac anti hbc', 'anti-hbc', 'anticorps anti hbc totaux', 'ac anti-hbc totaux']::text[], 'serology', 'index', '[{"unit":"S/CO","factor":1},{"unit":"COI","factor":1}]'::jsonb, 0, 1000),
  ('hcv_ab', 'Anticorps anti-VHC (hépatite C)', ARRAY['anticorps anti-vhc', 'ac anti-vhc', 'ac anti vhc', 'anti-vhc', 'sérologie hépatite c', 'serologie hepatite c', 'anti-hcv']::text[], 'serology', 'index', '[{"unit":"S/CO","factor":1},{"unit":"COI","factor":1}]'::jsonb, 0, 1000),
  ('hav_igg', 'Anticorps anti-VHA IgG (hépatite A)', ARRAY['anticorps anti-vha igg', 'ac anti-vha igg', 'anti-vha igg']::text[], 'serology', 'index', '[{"unit":"S/CO","factor":1},{"unit":"COI","factor":1}]'::jsonb, 0, 1000),
  ('hiv_ag_ab', 'VIH 1+2 (antigène p24 et anticorps)', ARRAY['vih 1+2', 'vih1+2', 'sérologie vih', 'serologie vih', 'ag p24 et ac anti-vih', 'ac anti-vih 1 et 2', 'dépistage vih', 'depistage vih', 'hiv 1+2']::text[], 'serology', 'index', '[{"unit":"S/CO","factor":1},{"unit":"COI","factor":1}]'::jsonb, 0, 1000),
  ('cmv_igg', 'Cytomégalovirus (CMV) IgG', ARRAY['cmv igg', 'cytomégalovirus igg', 'cytomegalovirus igg', 'ac anti-cmv igg', 'anticorps anti-cmv igg']::text[], 'serology', 'UA/mL', '[{"unit":"U/mL","factor":1}]'::jsonb, 0, 10000),
  ('ebv_vca_igg', 'Epstein-Barr (EBV) VCA IgG', ARRAY['ebv vca igg', 'vca igg', 'ac anti-vca igg', 'epstein-barr vca igg', 'epstein barr vca igg']::text[], 'serology', 'U/mL', '[{"unit":"UA/mL","factor":1}]'::jsonb, 0, 10000),
  ('rubella_igg', 'Rubéole IgG', ARRAY['rubéole igg', 'rubeole igg', 'ac anti-rubéole igg', 'anticorps anti-rubéole igg']::text[], 'serology', 'UI/mL', '[]'::jsonb, 0, 10000),
  ('toxo_igg', 'Toxoplasmose IgG', ARRAY['toxoplasmose igg', 'toxoplasma igg', 'ac anti-toxoplasme igg', 'anticorps anti-toxoplasme igg']::text[], 'serology', 'UI/mL', '[]'::jsonb, 0, 10000),
  ('vzv_igg', 'Varicelle-zona (VZV) IgG', ARRAY['vzv igg', 'varicelle igg', 'varicelle-zona igg', 'ac anti-vzv igg']::text[], 'serology', 'mUI/mL', '[{"unit":"UI/L","factor":1}]'::jsonb, 0, 100000),
  ('hcv_viral_load', 'Charge virale VHC', ARRAY['charge virale vhc', 'arn vhc', 'arn du vhc', 'hcv rna']::text[], 'serology', 'UI/mL', '[]'::jsonb, 0, 1000000000),
  ('hiv_viral_load', 'Charge virale VIH', ARRAY['charge virale vih', 'arn vih', 'arn vih-1', 'arn du vih', 'hiv rna']::text[], 'serology', 'copies/mL', '[]'::jsonb, 0, 1000000000)
ON CONFLICT (code) DO NOTHING;
