'use client';

import type { WeightSummary } from '@/lib/server/dashboard-data';
import { DashboardSparkline } from './dashboard-sparkline';
import { Card, CardHeader, Meta } from './ui';

const kg = (v: number) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dayLabel = (iso: string, todayIso: string) => {
  if (iso === todayIso) return 'aujourd’hui';
  const d = new Date(`${iso}T12:00:00Z`);
  const y = new Date(`${todayIso}T12:00:00Z`);
  if (y.getTime() - d.getTime() === 86_400_000) return 'hier';
  return `le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)}`;
};

/** Évolution sans jugement de valeur (couleur neutre) : « ↓ 0,6 kg ». */
function Change({ label, delta }: { label: string; delta: number | null }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2 text-center">
      <p className="text-[12px] text-ink-2">{label}</p>
      <p className="tabular text-lg font-bold">
        {delta === null ? '—' : delta === 0 ? '= 0,0' : `${delta < 0 ? '↓' : '↑'} ${kg(Math.abs(delta))}`}
        {delta !== null && <span className="ml-0.5 text-[13px] font-medium text-ink-3">kg</span>}
      </p>
    </div>
  );
}

/**
 * Carte « Poids » du tableau de bord : dernière pesée, évolution sur 1 et 6 mois, moyenne de chaque mois sur 6 mois,
 * Toute la carte mène à la page Poids (historique, statistiques et saisie).
 */
export function WeightCard({ weight, canWrite, isDemo }: { weight: WeightSummary; canWrite: boolean; isDemo: boolean }) {
  const { last, entries, todayIso } = weight;
  // Un point par mois sur les 6 derniers mois (moyenne des pesées du mois), comme l'HbA1c.
  const today = new Date(`${todayIso}T12:00:00Z`);
  const months = [5, 4, 3, 2, 1, 0].map((i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1, 12));
    const key = d.toISOString().slice(0, 7);
    const inMonth = entries.filter((e) => e.day.startsWith(key));
    return {
      t: d.getTime() + 14 * 86_400_000,
      start: d.getTime(),
      label: new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', ''),
      kg: inMonth.length ? Math.round((inMonth.reduce((a, e) => a + e.kg, 0) / inMonth.length) * 10) / 10 : null,
    };
  });
  const monthly = months.filter((m) => m.kg !== null) as (typeof months[number] & { kg: number })[];
  const min = monthly.length ? Math.min(...monthly.map((m) => m.kg)) : 0;
  const max = monthly.length ? Math.max(...monthly.map((m) => m.kg)) : 0;

  return (
    // Toute la carte mène à la page Poids (historique, statistiques, saisie).
    <Card href="/poids" accent="indigo">
      <CardHeader
        title="Poids"
        icon="scale"
        iconTone="indigo"
        action={
          <span className="inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
            Historique <span aria-hidden>›</span>
          </span>
        }
      />

      {last ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-ink-2">Dernière pesée</p>
              <p className="tabular mt-1 leading-none">
                <span className="text-4xl font-bold tracking-tight text-indigo">{kg(last.kg)}</span>
                <span className="ml-1.5 text-ink-3">kg</span>
              </p>
              <p className="mt-1.5 text-sm text-ink-2">{dayLabel(last.day, todayIso)}</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Change label="Sur 1 mois" delta={weight.change30} />
            <Change label="Sur 6 mois" delta={weight.change180} />
          </div>
          {monthly.length > 0 && (
            <>
              <p className="mt-3 text-sm font-medium text-ink-2">
                {monthly.length > 1 ? 'Moyenne de chaque mois, 6 derniers mois' : 'L’évolution apparaîtra au fil des mois'}
              </p>
              <DashboardSparkline
                points={monthly.map((m) => ({ t: m.t, v: m.kg }))}
                domain={[months[0]!.start, months[5]!.start + 30 * 86_400_000]}
                ticks={months.map((m) => ({ t: m.t, label: m.label }))}
                min={Math.floor(min - 1)}
                max={Math.ceil(max + 1)}
                dots
                maxGapMs={Infinity}
                color="var(--indigo)"
                height={64}
                labels={monthly.map((m) => kg(m.kg))}
                label={`Poids moyen par mois : ${monthly.map((m) => `${m.label} ${kg(m.kg)} kg`).join(', ')}`}
              />
            </>
          )}
        </>
      ) : (
        <p className="text-ink-2">Aucune pesée pour l’instant.{canWrite ? ' Touchez la carte pour noter votre poids.' : ''}</p>
      )}

      {isDemo && <Meta className="mt-2">Démonstration : données fictives.</Meta>}
    </Card>
  );
}
