import type { Metadata } from 'next';
import Link from 'next/link';
import { formatNumberFr, getAnalyte, referenceStatus } from '@bilanx/domain';
import { DEMO_LAB_RESULTS, DEMO_TIMEZONE } from '@/lib/demo-data';
import { CapsuleGauge } from '@/components/capsule-gauge';
import { Card, Meta, PageHeader } from '@/components/ui';

import { requireUser } from '@/lib/server/auth';
export const metadata: Metadata = { title: 'Analyses & Bilans' };

const STATUS = {
  below: { label: 'sous l’intervalle', cls: 'bg-amber-2 text-amber' },
  above: { label: 'au-dessus', cls: 'bg-amber-2 text-amber' },
  within: { label: 'dans l’intervalle', cls: 'bg-sage-2 text-sage' },
  unknown: { label: 'référence absente', cls: 'bg-surface-2 text-ink-2' },
} as const;

export default async function AnalysesPage() {
  await requireUser();
  const latest = new Map<string, (typeof DEMO_LAB_RESULTS)[number]>();
  for (const r of DEMO_LAB_RESULTS) {
    const cur = latest.get(r.analyteCode);
    if (!cur || r.sampledAt > cur.sampledAt) latest.set(r.analyteCode, r);
  }
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'short' });

  return (
    <div className="fade-in">
      <PageHeader
        title="Analyses & Bilans"
        subtitle={
          <>
            Position de chaque résultat par rapport à l’intervalle de référence <strong>de son laboratoire</strong>.
          </>
        }
      />
      <Card>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3.5">
          {[...latest.values()].map((r) => {
            const a = getAnalyte(r.analyteCode)!;
            const st = STATUS[referenceStatus(r.value, { low: r.refLow, high: r.refHigh })];
            return (
              <Link
                key={r.analyteCode}
                href={`/analyses/${r.analyteCode}`}
                className="card flex flex-col items-center gap-1.5 p-3.5 text-center transition-transform hover:-translate-y-0.5"
              >
                <CapsuleGauge value={r.value} refLow={r.refLow} refHigh={r.refHigh} label={a.nameFr} />
                <span className="text-sm font-semibold">{a.nameFr}</span>
                <span>
                  <strong className="tabular text-lg">{formatNumberFr(r.value)}</strong> <span className="text-xs text-ink-3">{r.unit}</span>
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                <Meta>{fmt.format(r.sampledAt)}</Meta>
              </Link>
            );
          })}
        </div>
        <p className="mt-4 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
          <strong>Comment lire la jauge ?</strong> La bande verte correspond à l’intervalle de référence du laboratoire, toujours placé
          entre 30 % et 70 % de la hauteur. Le repère ▶ indique la <strong>position</strong> du résultat dans cet intervalle — pas un
          « niveau de réserve ». Une jauge à moitié pleine ne signifie pas une carence à 50 %. Les références dépendent du laboratoire,
          de la méthode, de l’âge et du sexe : parlez de vos résultats avec votre médecin.
        </p>
      </Card>
    </div>
  );
}
