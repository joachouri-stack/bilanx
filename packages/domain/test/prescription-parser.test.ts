import { describe, expect, it } from 'vitest';
import { looksLikePrescription, parsePrescription } from '../src/prescription-parser';

const L = (s: string, confidence?: number) => s.trim().split('\n').map((text) => ({ text: text.trim(), page: 1, ...(confidence ? { confidence } : {}) }));

// Lignes réellement lues dans packages/documents/test/fixtures/ordonnance-fictive.pdf
const FICTIVE = L(`
Dr Paul EXEMPLE	Paris, le 03/11/2026
Médecine générale
12 rue de l'Exemple, 75000 Paris — RPPS 00000000000 (fictif)
Mme Claire DEMO
Ordonnance fictive générée pour les tests BILANX — aucune personne réelle
METFORMINE 1000 mg, comprimé pelliculé
1 comprimé matin et soir au milieu du repas, pendant 3 mois
ATORVASTATINE 20 mg, comprimé
1 comprimé le soir, pendant 3 mois
PARACÉTAMOL 1 g, comprimé
1 comprimé si douleur, jusqu'à 3 fois par jour, 3 g par jour maximum, pendant 5 jours
VITAMINE D3 100 000 UI, solution buvable en ampoule
1 ampoule par mois, pendant 3 mois
AMOXICILLINE 1 g, comprimé dispersible
1 comprimé 3 fois par jour pendant 7 jours
Renouvelable 2 fois.
Signature`);

describe('lecture d’une ordonnance', () => {
  it('ordonnance fictive : prescripteur, date, 5 traitements, rien d’autre', () => {
    const p = parsePrescription(FICTIVE);
    expect(p.prescriber).toBe('Dr Paul EXEMPLE');
    expect(p.date).toBe('2026-11-03');
    expect(p.items.map((i) => [i.name, i.strength])).toEqual([
      ['Metformine', '1000 mg'],
      ['Atorvastatine', '20 mg'],
      ['Paracétamol', '1 g'],
      ['Vitamine D3', '100 000 UI'],
      ['Amoxicilline', '1 g'],
    ]);
    expect(looksLikePrescription(FICTIVE)).toBe(true);
  });

  it('posologie recopiée telle quelle ; heures seulement d’après des mots explicites', () => {
    const [met, ator, para, vitd, amox] = parsePrescription(FICTIVE).items;
    expect(met).toMatchObject({ posology: '1 comprimé matin et soir au milieu du repas, pendant 3 mois', times: ['08:00', '20:00'], qty: '1 comprimé' });
    expect(met!.checks.map((c) => c.code)).toEqual(['times_from_words', 'end_from_duration']);
    expect(ator!.times).toEqual(['20:00']);
    // « si douleur » : jamais d'heure fixe, même avec « 3 fois par jour ».
    expect(para).toMatchObject({ times: [] });
    expect(para!.checks.map((c) => c.code)).toContain('as_needed');
    // « par mois » : pas de prise quotidienne.
    expect(vitd!.times).toEqual([]);
    expect(vitd!.checks.map((c) => c.code)).toContain('non_daily');
    // « 3 fois par jour » sans moment : à préciser par l'utilisateur, aucune heure inventée.
    expect(amox!.times).toEqual([]);
    expect(amox!.checks.find((c) => c.code === 'times_unspecified')?.severity).toBe('warn');
  });

  it('date de fin calculée à partir de la date de l’ordonnance (fin incluse), et signalée', () => {
    const items = parsePrescription(FICTIVE).items;
    expect(items.map((i) => [i.startDate, i.endDate])).toEqual([
      ['2026-11-03', '2027-02-02'],
      ['2026-11-03', '2027-02-02'],
      ['2026-11-03', '2026-11-07'],
      ['2026-11-03', '2027-02-02'],
      ['2026-11-03', '2026-11-09'],
    ]);
    expect(items[4]!.checks.find((c) => c.code === 'end_from_duration')?.messageFr).toContain('« pendant 7 jours »');
  });

  it('variantes : nom de marque, posologie sur la même ligne, date en lettres, trois moments, coucher', () => {
    const p = parsePrescription(
      L(`
Docteur Anne MARTIN
Lyon, le 3 novembre 2026
Doliprane 1000 mg : 1 cp 3 fois par jour si fièvre
- KARDEGIC 75 mg, 1 sachet le midi
LANTUS
20 unités au coucher
Glucophage 850 mg
1 comprimé matin, midi et soir pendant 2 semaines
Renouveler 3 mois`),
    );
    expect(p.prescriber).toBe('Dr Anne MARTIN');
    expect(p.date).toBe('2026-11-03');
    expect(p.items.map((i) => [i.name, i.strength, i.times])).toEqual([
      ['Doliprane', '1000 mg', []],
      ['Kardegic', '75 mg', ['12:00']],
      ['Lantus', null, ['22:00']],
      ['Glucophage', '850 mg', ['08:00', '12:00', '20:00']],
    ]);
    expect(p.items[0]!.posology).toBe('1 cp 3 fois par jour si fièvre');
    expect(p.items[2]).toMatchObject({ posology: '20 unités au coucher', qty: '20 unités' });
    expect(p.items[3]!.endDate).toBe('2026-11-16');
  });

  it('photo : confiance faible signalée ; sans date, aucune date de fin inventée', () => {
    const p = parsePrescription(L('METFORMINE 500 mg\n1 comprimé le matin pendant 1 mois', 0.6));
    expect(p.date).toBeNull();
    expect(p.items[0]).toMatchObject({ startDate: null, endDate: null });
    expect(p.items[0]!.checks.map((c) => c.code)).toEqual(['low_confidence', 'times_from_words']);
    // Avec une date de début fournie (date du dépôt), la fin est calculée.
    expect(parsePrescription(L('METFORMINE 500 mg\n1 comprimé le matin pendant 1 mois'), '2026-11-05').items[0]!.endDate).toBe('2026-12-04');
  });

  it('un bilan biologique ou un texte courant ne donne aucun traitement', () => {
    const bilan = L(`
LABORATOIRE DE BIOLOGIE MÉDICALE EXEMPLE
Patient : DEMO Claire
Glycémie à jeun 1,32 g/L 0,70 - 1,10
Hémoglobine glyquée (HbA1c) 7,2 % 4,0 - 6,0
Résultats validés par le biologiste.`);
    expect(looksLikePrescription(bilan)).toBe(false);
    expect(parsePrescription(L('Bonjour, voici le compte rendu de la consultation.\nPatiente vue ce jour, examen normal.')).items).toEqual([]);
  });

  it('lignes sans dosage, ni forme, ni posologie écartées (titres, lignes de bilan)', () => {
    // Lignes réellement lues sur la photo d'un bilan déposé comme ordonnance.
    const bilan = L(`
LABORATOIRE DE BIOLOGIE MÉDICALE EXEMPLE
Document fictif généré pour les tests BILANX — aucune personne réelle
BIOCHIMIE
Glycémie à jeun 1,32 g/L 0,70 - 1,10 (12/05/2026)
Hémoglobine glyquée (HbA1c) 7,2 % 4,0 - 6,0 (12/05/2026)
Créatinine 78 µmol/L 45 - 90
FER ET VITAMINES
Ferritine 25 µg/L 30 - 300 (17/02/2026)
25-OH Vitamine D 18 ng/mL 30 - 100
HÉMATOLOGIE
Plaquettes 250 G/L 150 - 400
Résultats validés par le biologiste.`);
    expect(parsePrescription(bilan).items).toEqual([]);
    // Un vrai traitement au milieu d'en-têtes reste proposé ; un nom seul suivi d'une forme aussi.
    const p = parsePrescription(
      L(`
CABINET MÉDICAL
TRAITEMENT DE FOND
LANTUS
20 unités au coucher
SPASFON comprimé
Ferritine 25 µg/L 30 - 300`),
    );
    expect(p.items.map((i) => i.name)).toEqual(['Lantus', 'Spasfon']);
  });
});
