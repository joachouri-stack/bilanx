import { describe, expect, it } from 'vitest';
import { assessDraft } from '../src/extraction-checks';
import { correctOcrUnit, parseLabReport, type SourceLine } from '../src/report-parser';

// Sorties RÉELLES de la lecture du bilan fictif (test/fixtures du paquet documents) :
// couche texte du PDF, puis reconnaissance de caractères sur la photo (avec ses erreurs).
const PDF = `LABORATOIRE DE BIOLOGIE MÉDICALE EXEMPLE
Document fictif généré pour les tests BILANX — aucune personne réelle
Patient : DEMO Claire Né(e) le : 12/03/1975
Prélevé le : 03/09/2026 à 08h12 Édité le : 04/09/2026
Prescripteur : Dr EXEMPLE
Analyse\tRésultat\tUnité\tValeurs de référence\tAntériorité
BIOCHIMIE
Glycémie à jeun\t1,32\tg/L\t0,70 - 1,10\t1,41 (12/05/2026)
Hémoglobine glyquée (HbA1c)\t7,2\t%\t4,0 - 6,0\t7,6 (12/05/2026)
Créatinine\t78\tμmol/L\t45 - 90
Magnésium\t0,75\tmmol/L\t0,70 - 1,05
FER ET VITAMINES
Ferritine\t25\tμg/L\t30 - 300\t19 (17/02/2026)
25-OH Vitamine D\t18\tng/mL\t30 - 100
HÉMATOLOGIE
Plaquettes\t250\tG/L\t150 - 400
Résultats validés par le biologiste. Document fictif.`;

const OCR = `LABORATOIRE DE BIOLOGIE MÉDICALE EXEMPLE
Document fictif généré pour les tests BILANX — aucune personne réelle
Patient : DEMO Claire Né(e) le : 12/03/1975
Prélevé le : 03/09/2026 à 08h12 Édité le : 04/09/2026
Prescripteur : Dr EXEMPLE
Analyse Résultat Unité Valeurs de référence Antériorité
BIOCHIMIE
Glycémie à jeun 1,32 g/L 0,70 -1,10 1,41 (12/05/2026)
Hémoglobine glyquée (HbALc) 2 % 4,0-6,0 7,6 (12/05/2026)
Créatinine 78 Hmol/L 45 - 90
Magnésium 0,75 mmol/L 0,70 - 1,05
FER ET VITAMINES
Ferritine 25 Hg/L 30 - 300 19 (17/02/2026)
25-OH Vitamine D 18 ng/mL 30 - 100
HÉMATOLOGIE
Plaquettes 250 G/L 150 - 400
Résultats validés par le biologiste. Document fictif.`;

const lines = (t: string): SourceLine[] => t.split('\n').map((text) => ({ page: 1, text }));
const NOW = new Date('2026-11-04T12:00:00Z');

describe('lecture d’un bilan (couche texte PDF)', () => {
  const r = parseLabReport(lines(PDF));

  it('détecte la date de prélèvement et le laboratoire', () => {
    expect(r.samplingDate).toBe('2026-09-03');
    expect(r.laboratory).toBe('LABORATOIRE DE BIOLOGIE MÉDICALE EXEMPLE');
  });

  it('extrait chaque résultat avec son unité et sa référence, sans les antériorités', () => {
    const got = r.drafts.map((d) => [d.analyteCode, d.rawValue, d.rawUnit, d.rawReference]);
    expect(got).toEqual([
      ['glucose_fasting', '1,32', 'g/L', '0,70 - 1,10'],
      ['hba1c', '7,2', '%', '4,0 - 6,0'],
      ['creatinine', '78', 'μmol/L', '45 - 90'],
      ['magnesium', '0,75', 'mmol/L', '0,70 - 1,05'],
      ['ferritin', '25', 'μg/L', '30 - 300'],
      ['vitamin_d_25oh', '18', 'ng/mL', '30 - 100'],
      ['platelets', '250', 'G/L', '150 - 400'],
    ]);
  });

  it('ne prend pas les dates ou l’en-tête pour des résultats', () => {
    expect(r.drafts.some((d) => /^(pr[ée]lev|patient|n[ée]\(e\)|[ée]dit)/i.test(d.rawLabel))).toBe(false);
  });

  it('chaque valeur reconnue passe les contrôles sans alerte', () => {
    for (const d of r.drafts.filter((x) => x.analyteCode)) {
      expect(assessDraft(d, PDF, NOW).status, d.rawLabel).toBe('ok');
    }
  });
});

describe('lecture d’une photo (reconnaissance de caractères, erreurs réelles)', () => {
  const r = parseLabReport(lines(OCR));
  const byCode = (c: string) => r.drafts.find((d) => d.analyteCode === c)!;

  it('corrige « Hmol/L » et « Hg/L » en µ… et le signale', () => {
    expect(byCode('creatinine')).toMatchObject({ rawUnit: 'µmol/L', unitCorrected: true });
    expect(byCode('ferritin')).toMatchObject({ rawUnit: 'µg/L', unitCorrected: true });
  });

  it('reconnaît « HbALc » mal lu grâce au libellé complet', () => {
    expect(byCode('hba1c').rawValue).toBe('2');
  });

  it('BLOQUE l’HbA1c lue « 2 % » au lieu de 7,2 % : valeur impossible', () => {
    const a = assessDraft(byCode('hba1c'), OCR, NOW);
    expect(a.status).toBe('block');
    expect(a.checks.map((c) => c.code)).toContain('implausible_value');
  });

  it('accepte les lignes correctement lues', () => {
    expect(assessDraft(byCode('magnesium'), OCR, NOW).status).toBe('ok');
    expect(assessDraft(byCode('vitamin_d_25oh'), OCR, NOW).status).toBe('ok');
  });
});

describe('cas particuliers', () => {
  it('lit les comparateurs et les références à borne unique', () => {
    const r = parseLabReport(lines('CRP\t< 5\tmg/L\t< 5\nDFG estimé (CKD-EPI)\t> 90\tmL/min/1,73m²'));
    expect(r.drafts[0]).toMatchObject({ analyteCode: 'crp', rawValue: '< 5', rawUnit: 'mg/L', rawReference: '< 5' });
    expect(r.drafts[1]).toMatchObject({ analyteCode: 'egfr', rawValue: '> 90' });
  });

  it('ignore « soit 55 mmol/mol » et les lignes sans résultat', () => {
    const r = parseLabReport(lines('HbA1c\t7,2\t%\nsoit 55 mmol/mol\nPage 1/2'));
    expect(r.drafts).toHaveLength(1);
  });

  it('n’invente pas de date de prélèvement absente', () => {
    expect(parseLabReport(lines('Ferritine 25 µg/L')).samplingDate).toBeNull();
  });

  it('corrections d’unité', () => {
    expect(correctOcrUnit('Hmol/L')).toEqual({ unit: 'µmol/L', corrected: true });
    expect(correctOcrUnit('mmol/L')).toEqual({ unit: 'mmol/L', corrected: false });
  });
});

describe('sérologies : conclusion Positif / Négatif lue dans le bilan', () => {
  const SERO = `LABORATOIRE DE BIOLOGIE MÉDICALE EXEMPLE
Prélevé le : 03/09/2026
SÉROLOGIES
Ac anti-VHC\tNégatif
VIH 1+2 (Ag p24 et Ac)\tNON REACTIF
Ac anti-HBs\t120\tmUI/mL\tPositif
Ac anti-HBc totaux\t0,15\tindex\t(Négatif < 1,00)
Toxoplasmose IgG\tDouteux
Interprétation : négatif
Ferritine\t25\tμg/L\t30 - 300`;
  const lines = (t: string): SourceLine[] => t.split('\n').map((text) => ({ page: 1, text }));
  const r = parseLabReport(lines(SERO));
  const by = (code: string) => r.drafts.find((d) => d.analyteCode === code);

  it('lit une conclusion seule, sans valeur ni unité', () => {
    expect(by('hcv_ab')).toMatchObject({ rawValue: '', rawUnit: null, rawQualitative: 'Négatif' });
    expect(by('hiv_ag_ab')).toMatchObject({ rawValue: '', rawQualitative: 'NON REACTIF' });
    expect(by('toxo_igg')).toMatchObject({ rawQualitative: 'Douteux' });
  });
  it('garde la valeur chiffrée et la conclusion quand les deux sont écrites', () => {
    expect(by('anti_hbs')).toMatchObject({ rawValue: '120', rawUnit: 'mUI/mL', rawQualitative: 'Positif' });
  });
  it('ignore un mot placé dans la référence', () => {
    expect(by('anti_hbc')).toMatchObject({ rawValue: '0,15', rawQualitative: null });
  });
  it('ne propose pas de ligne sans analyse reconnue, ni de conclusion pour une analyse chiffrée', () => {
    expect(r.drafts.some((d) => /interpr/i.test(d.rawLabel))).toBe(false);
    expect(by('ferritin')!.rawQualitative).toBeNull();
    expect(r.drafts).toHaveLength(6);
  });
  it('contrôles : conclusion seule acceptée sans alerte bloquante', () => {
    const a = assessDraft(by('hcv_ab')!, SERO);
    expect(a).toMatchObject({ qualitative: 'negative', parsedValue: null, status: 'ok' });
    expect(assessDraft(by('hiv_ag_ab')!, SERO).qualitative).toBe('negative');
    expect(assessDraft(by('anti_hbs')!, SERO)).toMatchObject({ qualitative: 'positive', parsedValue: 120 });
  });
  it('anti-hallucination : une conclusion absente du document bloque', () => {
    const a = assessDraft({ rawLabel: 'Ac anti-VHC', rawValue: '', rawQualitative: 'Positif', analyteCode: 'hcv_ab', samplingDate: new Date('2026-09-03') }, SERO);
    expect(a.status).toBe('block');
  });
});
