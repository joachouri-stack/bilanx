import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { agpProfile, computeGlucoseStats, insulinPeriod, stepsSeries, stepsStats, type GlucoseReading, type InsulinDose } from '@bilanx/domain';
import { buildReportPdf, pdfText, type ReportData } from '../src';

async function pdfToText(buf: Buffer): Promise<{ pages: number; text: string }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true });
  const doc = await task.promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const c = await (await doc.getPage(p)).getTextContent();
    text += (c.items as { str: string }[]).map((i) => i.str).join(' ') + '\n';
  }
  const pages = doc.numPages;
  await task.destroy();
  // pdf.js normalise le signe micro (U+00B5) en mu grec (U+03BC) : on ramène à la même graphie.
  return { pages, text: text.replace(/\s+/g, ' ').replace(/\u03bc/g, '\u00b5') };
}

const TZ = 'Europe/Paris';
function sample(): ReportData {
  const readings: GlucoseReading[] = [];
  for (let d = 0; d < 14; d++)
    for (let i = 0; i < 96; i++) readings.push({ at: new Date(Date.UTC(2026, 9, 22 + d, 0, i * 15)), mgdl: 120 + 50 * Math.sin(i / 10) + d, kind: 'sensor' });
  const stats = computeGlucoseStats(readings, { periodStart: new Date(Date.UTC(2026, 9, 22)), periodEnd: new Date(Date.UTC(2026, 10, 5)) });
  const doses: InsulinDose[] = [];
  for (let d = 0; d < 14; d += 2) doses.push({ at: new Date(Date.UTC(2026, 9, 22 + d, 7)), units: 4, type: 'rapid', status: 'taken' }, { at: new Date(Date.UTC(2026, 9, 22 + d, 20)), units: 16, type: 'long', status: 'taken' });
  const p = insulinPeriod(doses, TZ, { year: 2026, month: 10, day: 22 }, { year: 2026, month: 11, day: 4 });
  return {
    profile: { name: 'Jo Exemple', birthDate: '1975-03-12', relationship: 'self' },
    period: { from: '2026-10-22', to: '2026-11-04', days: 14 },
    generatedAt: new Date('2026-11-04T18:00:00Z'),
    generatedBy: 'Jo (jo@exemple.fr)',
    timeZone: TZ,
    isDemo: false,
    notAuthorized: [],
    glucose: { stats, agp: agpProfile(readings, TZ), capillaryCount: 2, source: 'import', targets: { low: 70, high: 180 } },
    hba1c: [
      { analyte: 'HbA1c', value: 7.6, comparator: null, unit: '%', refLow: 4, refHigh: 6, sampledAt: new Date('2026-05-12T10:00:00Z'), laboratory: 'Labo A', source: 'document' },
      { analyte: 'HbA1c', value: 7.2, comparator: null, unit: '%', refLow: 4, refHigh: 6, sampledAt: new Date('2026-10-30T10:00:00Z'), laboratory: 'Labo A', source: 'manual' },
    ],
    lab: [
      { analyte: 'Ferritine', value: 25, comparator: null, unit: 'µg/L', refLow: 30, refHigh: 300, sampledAt: new Date('2026-10-30T10:00:00Z'), laboratory: 'Labo A', source: 'document' },
      { analyte: 'CRP', value: 5, comparator: '<', unit: 'mg/L', refLow: null, refHigh: 5, sampledAt: new Date('2026-10-30T10:00:00Z'), laboratory: null, source: 'manual' },
    ],
    insulin: {
      days: p.days,
      total: p.summary.total,
      averagePerRecordedDay: p.averagePerRecordedDay,
      daysWithData: p.daysWithData,
      rapidSharePct: p.summary.rapidSharePct,
      products: [{ name: 'Insuline lente B', type: 'Lente (basale)' }],
      changes: [{ date: '2026-10-15', subject: 'Insuline lente B', previous: '18 U le soir', next: '16 U le soir', prescribedBy: 'Dr Exemple', goal: null }],
      source: 'manual',
    },
    medications: {
      items: [
        { name: 'Metformine', strength: '1000 mg', posology: '1 comprimé matin et soir', times: ['08:00', '20:00'], startDate: '2026-06-01', endDate: null, stoppedOn: null, stopReason: null, prescriber: 'Dr Exemple' },
        { name: 'Amoxicilline', strength: null, posology: '1 g matin, midi et soir', times: ['08:00', '12:00', '20:00'], startDate: '2026-10-20', endDate: '2026-10-26', stoppedOn: null, stopReason: null, prescriber: null },
      ],
      adherence: { planned: 40, taken: 30, skipped: 2, unrecorded: 8, takenPctOfRecorded: (30 / 32) * 100 },
      source: 'manual',
    },
    activity: (() => {
      const daily = new Map([['2026-10-30', 9500], ['2026-11-02', 4200]]);
      const days = stepsSeries(daily, { year: 2026, month: 10, day: 22 }, { year: 2026, month: 11, day: 4 });
      return { days, goal: 8000, stats: stepsStats(days, 8000), source: 'import' as const, devices: ['Apple Watch de Jo'] };
    })(),
    journal: [{ at: new Date('2026-11-03T11:30:00Z'), endedAt: null, title: 'Déjeuner', detail: 'Salade de lentilles · 45 g de glucides (indiqués)' }],
    appointments: [{ at: new Date('2026-11-17T09:30:00Z'), who: 'Endocrinologie — Dr Exemple', location: null, notesAfter: null, upcoming: true }],
  };
}

describe('rapport PDF', () => {
  it('produit un PDF lisible contenant chaque rubrique, les sources et les marques de saisie manuelle', async () => {
    const buf = await buildReportPdf(sample());
    writeFileSync(new URL('../test-output-rapport.pdf', import.meta.url), buf);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const { pages, text } = await pdfToText(buf);
    expect(pages).toBeGreaterThanOrEqual(2);
    for (const s of [
      'Rapport de suivi pour la consultation',
      'Jo Exemple',
      'du 22 octobre 2026 au 4 novembre 2026 (14 jours)',
      'ne constitue ni un diagnostic ni une recommandation',
      'Données disponibles sur la période',
      'Glycémie (capteur)',
      'Profil glycémique sur 24 h',
      'GMI (indicateur ESTIMÉ',
      '2 glycémie(s) capillaire(s)',
      '7,2 % (55 mmol/mol) (S)',
      'Points aux seules dates réelles',
      'Ferritine',
      '25 µg/L',
      'sous l’intervalle',
      '< 5 mg/L (S)',
      '140 U',
      '16 U le soir',
      'Dr Exemple',
      '45 g de glucides (indiqués)',
      'Endocrinologie — Dr Exemple',
      'Médicaments',
      'Metformine 1000 mg',
      '1 comprimé matin et soir',
      '08:00, 20:00',
      'jusqu’au 26 octobre 2026',
      '94 % des prises renseignées',
      'Une prise non renseignée n’est pas comptée comme oubliée',
      'Activité physique (pas)',
      '6 850 pas',
      '2 / 14',
      'Appareils : Apple Watch de Jo',
      'Page 1 /',
    ])
      expect(text, s).toContain(s);
    expect(text).not.toContain('?'.repeat(2));
  });

  it('signale les données absentes et les modules non autorisés, sans rien inventer', async () => {
    const d = sample();
    d.lab = [];
    d.journal = [];
    delete d.insulin;
    d.notAuthorized = ['insulin'];
    d.isDemo = true;
    const { text } = await pdfToText(await buildReportPdf(d));
    expect(text).toContain('Aucun autre résultat d’analyse sur la période.');
    expect(text).toContain('Aucune entrée de journal sur la période.');
    expect(text).toContain('non autorisé');
    d.medications = { items: [], adherence: { planned: 0, taken: 0, skipped: 0, unrecorded: 0, takenPctOfRecorded: null }, source: 'manual' };
    expect((await pdfToText(await buildReportPdf(d))).text).toContain('Aucun traitement enregistré sur la période.');
    expect(text).not.toContain('Total de la période');
    expect(text).toContain('DONNÉES FICTIVES');
  });

  it('remplace les caractères non représentables par les polices du PDF', () => {
    expect(pdfText('≤ 5 μmol/L 🍽 → ok')).toBe('<= 5 µmol/L  -> ok');
  });
});
