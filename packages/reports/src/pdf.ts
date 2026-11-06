/**
 * Rapport PDF de suivi, destiné à être lu en consultation.
 * Principes : uniquement des données enregistrées, sources et dates visibles,
 * saisies manuelles marquées, données absentes ou non autorisées signalées,
 * aucune interprétation ni recommandation.
 */
import PDFDocument from 'pdfkit';
import { formatGlucose, formatNumberFr, GLUCOSE_CONTEXTS, hba1cPercentToMmolMol, referenceStatus, type GlucoseContext } from '@bilanx/domain';
import { SECTION_LABELS, type ReportData, type ReportLab, type Source } from './types';

const C = {
  ink: '#1B2A30',
  ink2: '#4F5E64',
  ink3: '#6F7D84',
  line: '#D9D6CE',
  soft: '#F2F1EC',
  petrol: '#0F5562',
  sage: '#5F8A71',
  sageSoft: '#E1ECE5',
  glucose: '#2F6FDB',
  glucoseSoft: '#D6E3FA',
  amber: '#B86E22',
  violet: '#7A5BB5',
  red: '#C2412D',
};

/** Polices standard du PDF (WinAnsi) : remplacement des caractères non représentables. */
export function pdfText(s: string): string {
  return s
    .replace(/μ/g, 'µ')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/→/g, '->')
    .replace(/[  ]/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, '?');
}

const SOURCE_FR: Record<Source, string> = { manual: 'saisie manuelle (S)', document: 'bilan scanné et validé', import: 'import de fichier', demo: 'données fictives' };
const SOURCE_ACTIVITY = 'import Apple Santé (fichier)';
const activitySource = (a: { source: Source; manual?: boolean }) =>
  a.source === 'demo' ? SOURCE_FR.demo : a.source === 'manual' ? 'saisie manuelle' : a.manual ? `${SOURCE_ACTIVITY} et saisie manuelle` : SOURCE_ACTIVITY;

export async function buildReportPdf(d: ReportData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 54, bottom: 60, left: 48, right: 48 },
    bufferPages: true,
    info: { Title: `Rapport de suivi BILANX — ${d.profile.name}`, Author: 'BILANX', Subject: 'Rapport de suivi pour la consultation', Creator: 'BILANX' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const fmtDate = (iso: string) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' }).format(new Date(`${iso}T12:00:00Z`));
  const fmtD = (dt: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: d.timeZone, dateStyle: 'short' }).format(dt);
  const fmtDT = (dt: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: d.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(dt);
  const fmtT = (dt: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: d.timeZone, timeStyle: 'short' }).format(dt);
  const n = (v: number, dec = 1) => formatNumberFr(v, dec);

  const text = (s: string, opts: PDFKit.Mixins.TextOptions & { size?: number; bold?: boolean; color?: string; x?: number; y?: number } = {}) => {
    const { size = 9.5, bold = false, color = C.ink, x, y, ...o } = opts;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
    // Position toujours explicite : sinon PDFKit reprend l'abscisse du dernier texte écrit.
    const px = x ?? L;
    doc.text(pdfText(s), px, y ?? doc.y, { width: o.width ?? W - (px - L), ...o });
  };
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const h2 = (s: string) => {
    // Jamais de titre seul en bas de page : il faut la place pour le début de la rubrique.
    ensure(150);
    doc.moveDown(0.8);
    const y = doc.y;
    doc.rect(L, y, 3, 14).fill(C.petrol);
    text(s, { x: L + 10, y: y + 1, size: 12.5, bold: true, color: C.petrol });
    doc.moveDown(0.4);
  };
  const note = (s: string) => {
    text(s, { size: 8, color: C.ink3 });
    doc.moveDown(0.2);
  };
  const missing = (s: string) => {
    ensure(30);
    const y = doc.y;
    doc.roundedRect(L, y, W, 22, 4).fill(C.soft);
    text(s, { x: L + 8, y: y + 7, size: 8.5, color: C.ink2 });
    doc.y = y + 28;
  };

  /** Tableau simple, avec répétition de l'en-tête après un saut de page. */
  const table = (cols: { label: string; w: number; align?: 'left' | 'right' | 'center' }[], rows: string[][], opts: { emphasize?: (r: number) => string | null } = {}) => {
    const total = cols.reduce((a, c) => a + c.w, 0);
    const widths = cols.map((c) => (c.w / total) * W);
    const header = () => {
      const y = doc.y;
      doc.rect(L, y, W, 16).fill(C.soft);
      let x = L;
      cols.forEach((c, i) => {
        text(c.label, { x: x + 4, y: y + 4.5, width: widths[i]! - 8, size: 7.8, bold: true, color: C.ink2, align: c.align ?? 'left', lineBreak: false });
        x += widths[i]!;
      });
      doc.y = y + 18;
    };
    ensure(40);
    header();
    rows.forEach((r, ri) => {
      doc.font('Helvetica').fontSize(8.6);
      const h = Math.max(...r.map((cell, i) => doc.heightOfString(pdfText(cell), { width: widths[i]! - 8 }))) + 7;
      if (doc.y + h > bottom()) {
        doc.addPage();
        header();
      }
      const y = doc.y;
      let x = L;
      const color = opts.emphasize?.(ri) ?? C.ink;
      r.forEach((cell, i) => {
        text(cell, { x: x + 4, y: y + 3.5, width: widths[i]! - 8, size: 8.6, color: i === 0 ? C.ink : color, align: cols[i]!.align ?? 'left' });
        x += widths[i]!;
      });
      doc.moveTo(L, y + h).lineTo(L + W, y + h).lineWidth(0.4).strokeColor(C.line).stroke();
      doc.y = y + h + 1;
    });
    doc.moveDown(0.4);
  };

  const kpis = (items: [string, string][]) => {
    ensure(52);
    const y = doc.y;
    const w = (W - (items.length - 1) * 8) / items.length;
    items.forEach(([label, value], i) => {
      const x = L + i * (w + 8);
      doc.roundedRect(x, y, w, 44, 5).fill(C.soft);
      text(label, { x: x + 8, y: y + 7, width: w - 16, size: 7.6, color: C.ink3 });
      text(value, { x: x + 8, y: y + 20, width: w - 16, size: 13, bold: true });
    });
    doc.y = y + 52;
  };

  // ───────────────────────── En-tête ─────────────────────────
  text('BILANX', { size: 20, bold: true, color: C.petrol });
  text('Rapport de suivi pour la consultation', { size: 13, bold: true });
  doc.moveDown(0.3);
  const age =
    d.profile.birthDate &&
    Math.floor((new Date(d.period.to).getTime() - new Date(d.profile.birthDate).getTime()) / (365.25 * 86_400_000));
  text(`${d.profile.name}${d.profile.birthDate ? ` · né(e) le ${fmtDate(d.profile.birthDate)} (${age} ans)` : ''}`, { size: 10.5, bold: true });
  text(`Période : du ${fmtDate(d.period.from)} au ${fmtDate(d.period.to)} (${d.period.days} jours)`, { size: 9.5, color: C.ink2 });
  text(`Établi le ${fmtDT(d.generatedAt)} par ${d.generatedBy}`, { size: 8.5, color: C.ink3 });
  doc.moveDown(0.5);
  if (d.isDemo) {
    const y = doc.y;
    doc.roundedRect(L, y, W, 22, 4).fill('#FBEFE2');
    text('DONNÉES FICTIVES — profil de démonstration, ne concerne aucune personne réelle.', { x: L + 8, y: y + 7, size: 9, bold: true, color: C.amber });
    doc.y = y + 30;
  }
  {
    const y = doc.y;
    doc.roundedRect(L, y, W, 34, 4).lineWidth(0.6).strokeColor(C.line).stroke();
    text(
      'Document établi automatiquement à partir des données saisies, scannées ou importées par l’utilisateur. Il ne constitue ni un diagnostic ni une recommandation. Les intervalles de référence sont ceux des laboratoires. (S) = valeur saisie manuellement.',
      { x: L + 8, y: y + 6, width: W - 16, size: 7.8, color: C.ink2 },
    );
    doc.y = y + 42;
  }

  // ───────────────────────── Disponibilité des données ─────────────────────────
  h2('Données disponibles sur la période');
  const avail: string[][] = [];
  const row = (k: keyof typeof SECTION_LABELS, present: boolean, count: string, src: string) =>
    avail.push([SECTION_LABELS[k], d.notAuthorized.includes(k) ? 'non autorisé' : present ? count : 'aucune donnée', present ? src : '—']);
  if ('glucose' in d || d.notAuthorized.includes('glucose')) {
    const gl = d.glucose;
    const sensorN = gl?.stats.count ?? 0;
    const meterN = gl?.meter?.stats.count ?? gl?.capillaryCount ?? 0;
    const parts = [
      sensorN ? `capteur : ${sensorN} mesures, ${Math.round(gl!.stats.coveragePct)} % du temps couvert` : null,
      meterN ? `lecteur : ${meterN} mesure${meterN > 1 ? 's' : ''}` : null,
    ].filter(Boolean);
    const srcs = [sensorN && gl ? SOURCE_FR[gl.source] : null, meterN && gl ? SOURCE_FR[gl.meter?.source ?? (d.isDemo ? 'demo' : 'manual')] : null].filter(Boolean);
    row('glucose', sensorN + meterN > 0, parts.join(' · '), [...new Set(srcs)].join(', '));
  }
  if ('hba1c' in d || d.notAuthorized.includes('hba1c')) {
    const inP = (d.hba1c ?? []).filter((r) => r.sampledAt >= new Date(`${d.period.from}T00:00:00Z`));
    row('hba1c', inP.length > 0, `${inP.length} dosage(s) sur la période`, [...new Set(inP.map((r) => SOURCE_FR[r.source]))].join(', '));
  }
  if ('lab' in d || d.notAuthorized.includes('lab')) row('lab', !!d.lab?.length, `${d.lab?.length ?? 0} résultat(s)`, [...new Set((d.lab ?? []).map((r) => SOURCE_FR[r.source]))].join(', '));
  if ('insulin' in d || d.notAuthorized.includes('insulin'))
    row('insulin', !!d.insulin && d.insulin.total > 0, d.insulin ? `${d.insulin.daysWithData} jour(s) sur ${d.period.days} avec injections notées` : '', d.insulin ? SOURCE_FR[d.insulin.source] : '');
  if ('medications' in d || d.notAuthorized.includes('medications'))
    row('medications', !!d.medications?.items.length, `${d.medications?.items.length ?? 0} traitement(s)`, d.medications ? SOURCE_FR[d.medications.source] : '');
  if ('activity' in d || d.notAuthorized.includes('activity'))
    row('activity', !!d.activity?.stats.daysWithData, d.activity ? `${d.activity.stats.daysWithData} jour(s) sur ${d.period.days}` : '', d.activity ? activitySource(d.activity) : '');
  if ('journal' in d || d.notAuthorized.includes('journal')) row('journal', !!d.journal?.length, `${d.journal?.length ?? 0} entrée(s)`, d.isDemo ? SOURCE_FR.demo : SOURCE_FR.manual);
  if ('appointments' in d || d.notAuthorized.includes('appointments'))
    row('appointments', !!d.appointments?.length, `${d.appointments?.length ?? 0}`, d.isDemo ? SOURCE_FR.demo : SOURCE_FR.manual);
  table([{ label: 'Rubrique', w: 3 }, { label: 'Disponibilité', w: 3.4 }, { label: 'Source', w: 2.6 }], avail, {
    emphasize: (i) => (avail[i]![1] === 'aucune donnée' || avail[i]![1] === 'non autorisé' ? C.amber : null),
  });

  // ───────────────────────── Glycémie ─────────────────────────
  if (d.glucose) {
    const gl = d.glucose;
    h2(SECTION_LABELS.glucose);
    const s = gl.stats;
    const gu = gl.unit ?? 'mg/dL';
    const g = (v: number | null) => (v === null ? '—' : formatGlucose(v, gu));
    const sub = (t: string) => {
      ensure(70);
      text(t, { size: 10.5, bold: true });
      doc.moveDown(0.3);
    };
    const sensorPart = () => {
      sub('Capteur (mesure en continu)');
      kpis([
        ['Moyenne', `${formatGlucose(s.mean!, gu)} ${gu}`],
        ['Dans la cible', `${Math.round(s.pctInRange)} %`],
        ['Sous la cible', `${Math.round(s.pctLow + s.pctVeryLow)} %`],
        ['Au-dessus', `${Math.round(s.pctHigh + s.pctVeryHigh)} %`],
        ['Variations (CV)', `${Math.round(s.cv ?? 0)} %`],
      ]);
      text(
        `Plage cible ${formatGlucose(gl.targets.low, gu)}–${formatGlucose(gl.targets.high, gu)} ${gu} · très bas (< ${formatGlucose(54, gu)}) ${n(s.pctVeryLow)} % · bas ${n(s.pctLow)} % · élevé ${n(s.pctHigh)} % · très élevé (> ${formatGlucose(250, gu)}) ${n(s.pctVeryHigh)} % · min ${formatGlucose(s.min!, gu)} / max ${formatGlucose(s.max!, gu)} ${gu} · données disponibles ${Math.round(s.coveragePct)} %`,
        { size: 8.5, color: C.ink2 },
      );
      if (s.gmiReliable && s.gmiPercent !== null)
        text(`HbA1c ESTIMÉE par le capteur (GMI, ne remplace pas l’HbA1c de laboratoire) : ${n(s.gmiPercent)} %`, { size: 8.5, color: C.ink2 });
      else note('HbA1c estimée (GMI) non calculée : il faut au moins 14 jours et 70 % de données du capteur.');
      doc.moveDown(0.4);
      // Profil sur 24 h
      ensure(190);
      text('Profil glycémique sur 24 h (médiane, 25–75 % et 5–95 % des mesures par heure)', { size: 9, bold: true });
      const top = doc.y + 6;
      const ch = 140;
      const cx = L + 30;
      const cw = W - 36;
      const y = (v: number) => top + ch - (Math.min(Math.max(v, 40), 300) - 40) / 260 * ch;
      const x = (h: number) => cx + (h / 24) * cw;
      doc.rect(cx, y(gl.targets.high), cw, y(gl.targets.low) - y(gl.targets.high)).fill(C.sageSoft);
      for (const v of [54, 70, 180, 250]) {
        doc.moveTo(cx, y(v)).lineTo(cx + cw, y(v)).lineWidth(0.4).dash(2, { space: 2 }).strokeColor(v === 54 ? C.red : C.line).stroke().undash();
        text(formatGlucose(v, gu), { x: L, y: y(v) - 3.5, width: 26, size: 7, color: C.ink3, align: 'right' });
      }
      const pts = gl.agp.filter((a) => a.p50 !== null);
      const band = (lo: 'p5' | 'p25', hi: 'p95' | 'p75', color: string) => {
        if (pts.length < 2) return;
        doc.moveTo(x(pts[0]!.hour + 0.5), y(pts[0]![hi]!));
        for (const p of pts.slice(1)) doc.lineTo(x(p.hour + 0.5), y(p[hi]!));
        for (const p of [...pts].reverse()) doc.lineTo(x(p.hour + 0.5), y(p[lo]!));
        doc.closePath().fill(color);
      };
      band('p5', 'p95', '#E6EEFB');
      band('p25', 'p75', C.glucoseSoft);
      if (pts.length >= 2) {
        doc.moveTo(x(pts[0]!.hour + 0.5), y(pts[0]!.p50!));
        for (const p of pts.slice(1)) doc.lineTo(x(p.hour + 0.5), y(p.p50!));
        doc.lineWidth(1.6).strokeColor(C.glucose).stroke();
      }
      for (let h = 0; h <= 24; h += 3) text(`${String(h).padStart(2, '0')} h`, { x: x(h) - 12, y: top + ch + 4, width: 24, size: 7, color: C.ink3, align: 'center' });
      doc.y = top + ch + 18;
      const gaps = gl.agp.filter((a) => a.p50 === null).length;
      if (gaps) note(`${gaps} heure${gaps > 1 ? 's' : ''} sans assez de mesures (moins de 5) : laissée${gaps > 1 ? 's' : ''} vide${gaps > 1 ? 's' : ''}.`);
    };
    const meter = gl.meter;
    const meterPart = () => {
      sub('Lecteur (doigt) : glycémies saisies');
      if (!meter) {
        if (gl.capillaryCount) note(`${gl.capillaryCount} glycémie${gl.capillaryCount > 1 ? 's' : ''} du lecteur sur la période, non incluse${gl.capillaryCount > 1 ? 's' : ''} dans les statistiques du capteur.`);
        else missing('Aucune glycémie du lecteur sur la période.');
        return;
      }
      const m = meter.stats;
      if (m.count === 0) return missing('Aucune glycémie du lecteur sur la période.');
      kpis([
        ['Mesures', `${m.count} (${m.days} jour${m.days > 1 ? 's' : ''})`],
        ['Moyenne', `${g(m.mean)} ${gu}`],
        ['Min / max', `${g(m.min)} / ${g(m.max)}`],
        ['À jeun (moyenne)', m.byContext.fasting.count ? `${g(m.byContext.fasting.mean)} (${m.byContext.fasting.count})` : '—'],
        ['Après un repas (moyenne)', m.byContext.after_meal.count ? `${g(m.byContext.after_meal.mean)} (${m.byContext.after_meal.count})` : '—'],
      ]);
      const ctxLine = (['before_meal', 'bedtime', 'night', 'other'] as const)
        .filter((c) => m.byContext[c].count)
        .map((c) => `${GLUCOSE_CONTEXTS[c].toLowerCase()} ${g(m.byContext[c].mean)} ${gu} (${m.byContext[c].count})`);
      text(
        [
          `${m.belowLow} valeur${m.belowLow > 1 ? 's' : ''} sous ${g(gl.targets.low)} ${gu}`,
          `${m.aboveHigh} au-dessus de ${g(gl.targets.high)} ${gu}`,
          ...(ctxLine.length ? [`moyennes : ${ctxLine.join(', ')}`] : []),
          ...(m.noContext ? [`${m.noContext} sans moment noté`] : []),
        ].join(' · '),
        { size: 8.5, color: C.ink2 },
      );
      note('Mesures ponctuelles au bout du doigt : comptées à part, jamais mêlées aux statistiques du capteur. (S) = valeur saisie.');
      table(
        [{ label: 'Date et heure', w: 1.6 }, { label: 'Glycémie', w: 1.6 }, { label: 'Moment', w: 1.8 }, { label: 'Source', w: 1.4 }],
        meter.readings.map((r) => [
          fmtDT(r.at),
          `${g(r.mgdl)} ${gu}${meter.source === 'demo' ? '' : ' (S)'}`,
          r.context && r.context in GLUCOSE_CONTEXTS ? GLUCOSE_CONTEXTS[r.context as GlucoseContext] : '—',
          meter.source === 'demo' ? SOURCE_FR.demo : '(S) saisie',
        ]),
      );
    };
    if (s.count === 0 && (meter?.stats.count ?? gl.capillaryCount) > 0) {
      // Sans capteur : le lecteur d'abord.
      meterPart();
      sub('Capteur (mesure en continu)');
      missing('Aucune mesure du capteur sur la période.');
    } else {
      if (s.count === 0) {
        sub('Capteur (mesure en continu)');
        missing('Aucune mesure du capteur sur la période.');
      } else sensorPart();
      meterPart();
    }
  }

  // ───────────────────────── HbA1c ─────────────────────────
  if (d.hba1c) {
    h2(SECTION_LABELS.hba1c);
    if (!d.hba1c.length) missing('Aucune HbA1c de laboratoire enregistrée.');
    else {
      const h = [...d.hba1c].sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime());
      if (h.length >= 2) {
        ensure(130);
        const top = doc.y + 4;
        const ch = 90;
        const cx = L + 30;
        const cw = W - 40;
        const vals = h.map((r) => r.value);
        const lo = Math.floor(Math.min(4, ...vals) - 0.5);
        const hi = Math.ceil(Math.max(...vals) + 0.5);
        const t0 = h[0]!.sampledAt.getTime();
        const t1 = h.at(-1)!.sampledAt.getTime();
        const x = (t: number) => cx + 10 + ((t - t0) / Math.max(1, t1 - t0)) * (cw - 20);
        const y = (v: number) => top + ch - ((v - lo) / (hi - lo)) * ch;
        for (const v of [lo, (lo + hi) / 2, hi]) {
          doc.moveTo(cx, y(v)).lineTo(cx + cw, y(v)).lineWidth(0.4).strokeColor(C.line).stroke();
          text(`${n(v)} %`, { x: L - 4, y: y(v) - 3.5, width: 30, size: 7, color: C.ink3, align: 'right' });
        }
        doc.moveTo(x(h[0]!.sampledAt.getTime()), y(h[0]!.value));
        for (const r of h.slice(1)) doc.lineTo(x(r.sampledAt.getTime()), y(r.value));
        doc.lineWidth(1.4).strokeColor(C.petrol).stroke();
        for (const r of h) {
          doc.circle(x(r.sampledAt.getTime()), y(r.value), 2.8).fill(C.petrol);
          text(n(r.value), { x: x(r.sampledAt.getTime()) - 14, y: y(r.value) - 13, width: 28, size: 7.5, bold: true, align: 'center' });
          text(fmtD(r.sampledAt), { x: x(r.sampledAt.getTime()) - 22, y: top + ch + 3, width: 44, size: 6.8, color: C.ink3, align: 'center' });
        }
        doc.y = top + ch + 16;
        note('Points aux seules dates réelles de prélèvement ; aucune valeur interpolée.');
      }
      table(
        [{ label: 'Prélèvement', w: 1.4 }, { label: 'HbA1c', w: 1.6 }, { label: 'Référence labo', w: 1.4 }, { label: 'Laboratoire', w: 2.2 }, { label: 'Source', w: 1.8 }],
        [...h].reverse().map((r) => [
          fmtD(r.sampledAt),
          `${n(r.value)} % (${Math.round(hba1cPercentToMmolMol(r.value))} mmol/mol)${r.source === 'manual' ? ' (S)' : ''}`,
          refText(r),
          r.laboratory ?? '—',
          SOURCE_FR[r.source],
        ]),
      );
    }
  }

  // ───────────────────────── Autres analyses ─────────────────────────
  if (d.lab) {
    h2(SECTION_LABELS.lab);
    if (!d.lab.length) missing('Aucun autre résultat d’analyse sur la période.');
    else {
      const rows = [...d.lab].sort((a, b) => b.sampledAt.getTime() - a.sampledAt.getTime());
      const st = rows.map((r) => referenceStatus(r.value, { low: r.refLow, high: r.refHigh }));
      table(
        [{ label: 'Analyse', w: 2 }, { label: 'Résultat', w: 1.6 }, { label: 'Référence labo', w: 1.4 }, { label: 'Position', w: 1.7 }, { label: 'Prélèvement', w: 1.2 }, { label: 'Source', w: 1.6 }],
        rows.map((r, i) => [
          r.analyte,
          `${r.comparator ? `${r.comparator} ` : ''}${formatNumberFr(r.value, 3)} ${r.unit}${r.source === 'manual' ? ' (S)' : ''}`,
          refText(r),
          st[i] === 'below' ? 'sous l’intervalle' : st[i] === 'above' ? 'au-dessus' : st[i] === 'within' ? 'dans l’intervalle' : 'réf. absente',
          fmtD(r.sampledAt),
          SOURCE_FR[r.source],
        ]),
        { emphasize: (i) => (st[i] === 'below' || st[i] === 'above' ? C.amber : null) },
      );
      note('Position par rapport à l’intervalle imprimé par chaque laboratoire ; à interpréter par le professionnel de santé.');
    }
  }

  // ───────────────────────── Insuline ─────────────────────────
  if (d.insulin) {
    h2(SECTION_LABELS.insulin);
    const ins = d.insulin;
    if (ins.products.length) text(`Insulines : ${ins.products.map((p) => `${p.name} (${p.type})`).join(' · ')}`, { size: 8.8, color: C.ink2 });
    if (!ins.total) missing('Aucune injection notée sur la période.');
    else {
      kpis([
        ['Total de la période', `${n(ins.total)} U`],
        ['Moyenne par jour noté', ins.averagePerRecordedDay === null ? '—' : `${n(ins.averagePerRecordedDay)} U`],
        ['Jours avec injections', `${ins.daysWithData} / ${d.period.days}`],
        ['Part d’insuline rapide', ins.rapidSharePct === null ? '—' : `${Math.round(ins.rapidSharePct)} %`],
      ]);
      ensure(140);
      const top = doc.y + 4;
      const ch = 95;
      const cx = L + 26;
      const cw = W - 30;
      const max = Math.max(10, ...ins.days.map((x) => x.total));
      const topV = Math.ceil(max / 10) * 10;
      const bw = cw / ins.days.length;
      const y = (v: number) => top + ch - (v / topV) * ch;
      for (const v of [0, topV / 2, topV]) {
        doc.moveTo(cx, y(v)).lineTo(cx + cw, y(v)).lineWidth(0.4).strokeColor(C.line).stroke();
        text(String(v), { x: L, y: y(v) - 3.5, width: 22, size: 7, color: C.ink3, align: 'right' });
      }
      ins.days.forEach((day, i) => {
        const x = cx + i * bw + bw * 0.15;
        const w = Math.max(0.8, bw * 0.7);
        let acc = 0;
        for (const [v, col] of [
          [day.long, C.petrol],
          [day.rapid, C.violet],
          [day.other, C.ink3],
        ] as const) {
          if (!v) continue;
          doc.rect(x, y(acc + v), w, y(acc) - y(acc + v)).fill(col);
          acc += v;
        }
        if (bw >= 16 && day.total) text(n(day.total, 1), { x: x - 6, y: y(day.total) - 10, width: w + 12, size: 6.5, align: 'center' });
      });
      doc.y = top + ch + 6;
      note('Unités injectées par jour (lente en bleu pétrole, rapide en violet). Jours sans saisie laissés vides.');
    }
    if (ins.changes.length) {
      text('Modifications prescrites enregistrées', { size: 9, bold: true });
      doc.moveDown(0.2);
      table(
        [{ label: 'Date d’effet', w: 1.2 }, { label: 'Insuline', w: 1.6 }, { label: 'Avant', w: 1.4 }, { label: 'Prescription', w: 1.6 }, { label: 'Prescrit par / objectif', w: 2.6 }],
        ins.changes.map((c) => [fmtDate(c.date), c.subject, c.previous ?? '—', c.next, [c.prescribedBy, c.goal && `objectif : ${c.goal}`].filter(Boolean).join(' · ') || '—']),
      );
    }
  }

  // ───────────────────────── Médicaments ─────────────────────────
  if (d.medications) {
    h2(SECTION_LABELS.medications);
    const md = d.medications;
    if (!md.items.length) missing('Aucun traitement enregistré sur la période.');
    else {
      const per = (m: (typeof md.items)[number]) =>
        [m.startDate ? `depuis ${fmtDate(m.startDate)}` : null, m.stoppedOn ? `arrêté le ${fmtDate(m.stoppedOn)}${m.stopReason ? ` (${m.stopReason})` : ''}` : m.endDate ? `jusqu’au ${fmtDate(m.endDate)}` : null]
          .filter(Boolean)
          .join(', ') || '—';
      table(
        [{ label: 'Médicament', w: 2 }, { label: 'Posologie prescrite', w: 2.8 }, { label: 'Heures', w: 1.2 }, { label: 'Période', w: 2.2 }, { label: 'Prescrit par', w: 1.4 }],
        md.items.map((m) => [`${m.name}${m.strength ? ` ${m.strength}` : ''}`, m.posology, m.times.join(', ') || 'si besoin', per(m), m.prescriber ?? '—']),
      );
      const a = md.adherence;
      if (a.planned > 0) {
        kpis([
          ['Prises prévues (passées)', `${a.planned}`],
          ['Notées prises', `${a.taken}`],
          ['Notées non prises', `${a.skipped}`],
          ['Non renseignées', `${a.unrecorded}`],
        ]);
        note(
          `Suivi déclaratif : ${a.takenPctOfRecorded === null ? 'aucune prise renseignée' : `${Math.round(a.takenPctOfRecorded)} % des prises renseignées ont été notées prises`}. Une prise non renseignée n’est pas comptée comme oubliée.`,
        );
      }
      note('Traitements recopiés des ordonnances par l’utilisateur ; BILANX ne propose ni ne modifie aucune dose.');
    }
  }

  // ───────────────────────── Activité ─────────────────────────
  if (d.activity) {
    h2(SECTION_LABELS.activity);
    const a = d.activity;
    if (!a.stats.daysWithData) missing('Aucun nombre de pas sur la période.');
    else {
      kpis([
        ['Moyenne par jour renseigné', `${n(a.stats.averagePerDay!, 0)} pas`],
        ['Jours renseignés', `${a.stats.daysWithData} / ${d.period.days}`],
        [`Objectif ${n(a.goal, 0)} atteint`, `${a.stats.goalReachedDays} jour(s)`],
        ['Meilleur jour', `${n(a.stats.best!.steps!, 0)} pas`],
      ]);
      ensure(130);
      const top = doc.y + 4;
      const ch = 90;
      const cx = L + 34;
      const cw = W - 38;
      const max = Math.max(a.goal, ...a.days.map((x) => x.steps ?? 0));
      const topV = Math.ceil(max / 2000) * 2000;
      const bw = cw / a.days.length;
      const y = (v: number) => top + ch - (v / topV) * ch;
      for (const v of [0, topV / 2, topV]) {
        doc.moveTo(cx, y(v)).lineTo(cx + cw, y(v)).lineWidth(0.4).strokeColor(C.line).stroke();
        text(n(v, 0), { x: L, y: y(v) - 3.5, width: 30, size: 7, color: C.ink3, align: 'right' });
      }
      doc.moveTo(cx, y(a.goal)).lineTo(cx + cw, y(a.goal)).lineWidth(0.6).dash(3, { space: 3 }).strokeColor(C.sage).stroke().undash();
      a.days.forEach((day, i) => {
        if (day.steps === null || day.steps <= 0) return;
        const x = cx + i * bw + bw * 0.15;
        doc.rect(x, y(day.steps), Math.max(0.8, bw * 0.7), y(0) - y(day.steps)).fill(day.steps >= a.goal ? C.sage : C.petrol);
      });
      doc.y = top + ch + 6;
      note(`Pas par jour (barres vertes : objectif atteint ; jours sans donnée laissés vides).${a.devices.length ? ` Appareils : ${a.devices.join(', ')}. iPhone et Apple Watch dédoublonnés heure par heure.` : ''}${a.manual ? ' Certains jours ont été saisis à la main.' : ''}`);
    }
  }

  // ───────────────────────── Journal ─────────────────────────
  if (d.journal) {
    h2(SECTION_LABELS.journal);
    if (!d.journal.length) missing('Aucune entrée de journal sur la période.');
    else {
      const max = 150;
      table(
        [{ label: 'Date', w: 1.3 }, { label: 'Événement', w: 1.6 }, { label: 'Détail', w: 5 }],
        d.journal.slice(-max).map((j) => [`${fmtD(j.at)} ${fmtT(j.at)}${j.endedAt ? `–${fmtT(j.endedAt)}` : ''}`, j.title, j.detail || '—']),
      );
      if (d.journal.length > max) note(`Seules les ${max} entrées les plus récentes sont reproduites (${d.journal.length} au total).`);
      note('Glucides : uniquement les quantités indiquées par l’utilisateur (jamais estimées).');
    }
  }

  // ───────────────────────── Rendez-vous ─────────────────────────
  if (d.appointments) {
    h2(SECTION_LABELS.appointments);
    if (!d.appointments.length) missing('Aucun rendez-vous sur la période ni à venir.');
    else
      table(
        [{ label: 'Date', w: 1.4 }, { label: 'Rendez-vous', w: 2.4 }, { label: 'Lieu', w: 2 }, { label: 'Notes après consultation', w: 3.2 }],
        d.appointments.map((a) => [`${fmtDT(a.at)}${a.upcoming ? ' (à venir)' : ''}`, a.who, a.location ?? '—', a.notesAfter ?? '—']),
      );
  }

  // ───────────────────────── Pied de page ─────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 36;
    doc.moveTo(L, y - 6).lineTo(L + W, y - 6).lineWidth(0.4).strokeColor(C.line).stroke();
    text(`BILANX · ${d.profile.name} · ${fmtDate(d.period.from)} – ${fmtDate(d.period.to)}${d.isDemo ? ' · DONNÉES FICTIVES' : ''}`, {
      x: L,
      y,
      width: W - 60,
      size: 7,
      color: C.ink3,
      lineBreak: false,
    });
    text(`Page ${i - range.start + 1} / ${range.count}`, { x: L + W - 60, y, width: 60, size: 7, color: C.ink3, align: 'right', lineBreak: false });
    doc.page.margins.bottom = savedBottom;
  }
  doc.end();
  return done;
}

function refText(r: ReportLab): string {
  if (r.refLow != null && r.refHigh != null) return `${formatNumberFr(r.refLow, 3)} – ${formatNumberFr(r.refHigh, 3)}`;
  if (r.refHigh != null) return `< ${formatNumberFr(r.refHigh, 3)}`;
  if (r.refLow != null) return `> ${formatNumberFr(r.refLow, 3)}`;
  return '—';
}
