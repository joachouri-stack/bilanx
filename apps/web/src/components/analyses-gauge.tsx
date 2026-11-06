import { GAUGE_RANGE_HIGH, GAUGE_RANGE_LOW, formatNumberFr, gaugePosition, referenceStatus } from '@bilanx/domain';
import { Chip, type Tone } from './ui';

export const REFERENCE_STATUS: Record<'below' | 'above' | 'within' | 'unknown', { label: string; tone: Tone }> = {
  below: { label: 'Sous les valeurs de référence', tone: 'amber' },
  above: { label: 'Au-dessus des valeurs de référence', tone: 'amber' },
  within: { label: 'Dans les valeurs de référence', tone: 'sage' },
  unknown: { label: 'Sans valeurs de référence', tone: 'neutral' },
};

/** Pastille « dans / au-dessus / sous les valeurs de référence ». */
export function ReferenceChip({ value, refLow, refHigh }: { value: number; refLow: number | null | undefined; refHigh: number | null | undefined }) {
  const st = REFERENCE_STATUS[referenceStatus(value, { low: refLow, high: refHigh })];
  return <Chip tone={st.tone}>{st.label}</Chip>;
}

/**
 * Petite jauge horizontale : la bande verte = valeurs de référence du laboratoire (toujours entre 30 et 70 % de la largeur),
 * le repère = position du résultat. Rien n'est affiché sans valeurs de référence.
 */
export function ReferenceBar({ value, refLow, refHigh, label }: { value: number; refLow: number | null | undefined; refHigh: number | null | undefined; label: string }) {
  const g = gaugePosition(value, { low: refLow, high: refHigh });
  if (!g) return null;
  const from = g.partialRange && refHigh != null ? 0 : GAUGE_RANGE_LOW;
  const to = g.partialRange && refLow != null ? 1 : GAUGE_RANGE_HIGH;
  const ref = refLow != null && refHigh != null ? `${formatNumberFr(refLow)} à ${formatNumberFr(refHigh)}` : refHigh != null ? `moins de ${formatNumberFr(refHigh)}` : `plus de ${formatNumberFr(refLow!)}`;
  return (
    <div role="img" aria-label={`${label} : ${formatNumberFr(value)}, valeurs de référence ${ref}`} className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full border border-line bg-surface-2" />
      <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-sage/40 ring-1 ring-sage" style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }} />
      <div
        className={`absolute top-0 h-5 w-1.5 -translate-x-1/2 rounded-full ring-2 ring-surface ${g.status === 'within' ? 'bg-ink' : 'bg-amber'}`}
        style={{ left: `${g.position * 100}%` }}
      />
    </div>
  );
}
