import type { Metadata } from 'next';
import Link from 'next/link';
import {
  addDays,
  compareLocalDates,
  computeGlucoseStats,
  dayBounds,
  formatLocalDate,
  formatNumberFr,
  glucoseForDisplay,
  JOURNAL_KINDS,
  MEAL_KINDS,
  parseLocalDate,
} from '@bilanx/domain';
import { DEMO_TIMEZONE, demoDay, demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { insulin, journal } from '@/lib/server/auth';
import { glucoseDay } from '@/lib/server/data';
import { deleteJournalAction } from '@/lib/server/actions';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { GlucoseDayChart } from '@/components/glucose-day-chart';
import { JournalForm } from '@/components/journal-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Journal & Repas' };

interface Item {
  id: string | null;
  at: Date;
  endedAt: Date | null;
  icon: string;
  title: string;
  detail: string;
  source: 'journal' | 'insulin';
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ jour?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'journal')) return <ModuleForbidden title="Journal & Repas" profileName={name} />;
  const sp = await searchParams;
  const now = new Date();
  const today = demoToday(now);
  let day = (sp.jour && parseLocalDate(sp.jour)) || today;
  if (compareLocalDates(day, today) > 0) day = today;
  const isToday = compareLocalDates(day, today) === 0;
  const isDemo = ctx.active.kind === 'demo';
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'journal', 'write');
  const { start, end } = dayBounds(day, DEMO_TIMEZONE);
  const fmtT = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' });

  // Chronologie : journal + injections (si autorisées) ; démonstration : événements fictifs.
  const items: Item[] = [];
  if (ctx.active.kind === 'demo') {
    for (const e of demoDay(day, now).events)
      items.push({ id: null, at: e.at, endedAt: null, icon: e.kind === 'injection' ? '💉' : (JOURNAL_KINDS[e.kind as keyof typeof JOURNAL_KINDS]?.icon ?? '📝'), title: e.label, detail: e.detail, source: e.kind === 'injection' ? 'insulin' : 'journal' });
  } else {
    const pid = ctx.active.access.profileId;
    for (const r of await journal().list(ctx.user, pid, start, end))
      items.push({
        id: r.id,
        at: r.at,
        endedAt: r.endedAt,
        icon: JOURNAL_KINDS[r.kind].icon,
        title: r.kind === 'meal' && r.mealKind ? MEAL_KINDS[r.mealKind] : JOURNAL_KINDS[r.kind].label,
        detail: [
          r.description,
          r.quantities,
          r.carbsG !== null ? `${formatNumberFr(r.carbsG)} g de glucides (indiqués)` : null,
          r.intensity ? `intensité ${r.intensity}/5` : null,
          r.comment,
        ]
          .filter(Boolean)
          .join(' · '),
        source: 'journal',
      });
    if (moduleAllowed(ctx.active, 'insulin'))
      for (const d of await insulin().listDoses(ctx.user, pid, start, end))
        if (d.status === 'taken')
          items.push({ id: null, at: d.at, endedAt: null, icon: '💉', title: `${formatNumberFr(d.units)} U · ${d.productName}`, detail: d.comment ?? 'Injection notée comme faite', source: 'insulin' });
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime());

  const showGlucose = moduleAllowed(ctx.active, 'glucose');
  const g = showGlucose ? await glucoseDay(ctx, day, now) : null;
  const stats = g && g.sensor.length ? computeGlucoseStats(g.sensor, { periodStart: start, periodEnd: isToday ? now : end }) : null;
  const meals = items.filter((i) => i.source === 'journal' && Object.values(MEAL_KINDS).includes(i.title as never));
  const hrefFor = (d: typeof day) => `/journal?jour=${formatLocalDate(d)}`;
  const navBtn = 'inline-grid min-h-11 min-w-11 place-items-center rounded-xl border border-line bg-surface px-3 font-medium hover:bg-surface-2';
  const dayLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'full' }).format(start);
  const defaultTime = isToday ? fmtT.format(now) : '12:00';

  return (
    <div className="fade-in">
      <PageHeader title="Journal & Repas" subtitle={`Profil : ${name}${isDemo ? ' (démonstration, données fictives)' : ''}`} />
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={hrefFor(addDays(day, -1))} className={navBtn} aria-label="Jour précédent">
            ←
          </Link>
          <h2 className="min-w-[210px] text-center font-semibold first-letter:uppercase" aria-live="polite">
            {dayLabel}
          </h2>
          {!isToday ? (
            <Link href={hrefFor(addDays(day, 1))} className={navBtn} aria-label="Jour suivant">
              →
            </Link>
          ) : (
            <span className={`${navBtn} opacity-40`} aria-disabled>
              →
            </span>
          )}
          <form action="/journal" className="flex items-center gap-2">
            <label className="sr-only" htmlFor="jour">
              Choisir une date
            </label>
            <input id="jour" type="date" name="jour" defaultValue={formatLocalDate(day)} max={formatLocalDate(today)} className="min-h-11 rounded-xl border border-line bg-surface px-3" />
            <button type="submit" className={navBtn}>
              Afficher
            </button>
          </form>
          {!isToday && (
            <Link href="/journal" className={navBtn}>
              Aujourd’hui
            </Link>
          )}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <h2 className="font-semibold">La journée</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip tone="neutral">{meals.length} repas noté{meals.length > 1 ? 's' : ''}</Chip>
              <Chip tone="neutral">{items.filter((i) => i.source === 'journal').length - meals.length} événement(s)</Chip>
              {moduleAllowed(ctx.active, 'insulin') && <Chip tone="neutral">{items.filter((i) => i.source === 'insulin').length} injection(s)</Chip>}
              {stats?.mean != null && (
                <Chip tone="glucose">
                  Glycémie moyenne {glucoseForDisplay(stats.mean, 'mg/dL')} mg/dL · {Math.round(stats.pctInRange)} % dans la cible
                </Chip>
              )}
            </div>
            {items.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-3">Rien n’est noté pour cette journée.</p>
            ) : (
              <ol className="mt-4 flex flex-col">
                {items.map((it, i) => (
                  <li key={`${it.source}-${it.id ?? i}`} className="flex gap-3 border-l-2 border-line pb-4 pl-4 last:pb-0">
                    <span className="-ml-[29px] grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-sm" aria-hidden>
                      {it.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">
                        <span className="tabular font-semibold">
                          {fmtT.format(it.at)}
                          {it.endedAt ? `–${fmtT.format(it.endedAt)}` : ''}
                        </span>{' '}
                        · <span className="font-medium">{it.title}</span>
                      </span>
                      {it.detail && <span className="block text-sm text-ink-2">{it.detail}</span>}
                    </span>
                    {canWrite && it.id && (
                      <details className="relative shrink-0">
                        <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs text-ink-3 hover:bg-surface-2">Supprimer</summary>
                        <form action={deleteJournalAction} className="absolute right-0 z-10 mt-1">
                          <input type="hidden" name="entryId" value={it.id} />
                          <input type="hidden" name="jour" value={formatLocalDate(day)} />
                          <button type="submit" className="whitespace-nowrap rounded-lg bg-red-2 px-2.5 py-1.5 text-xs font-medium text-red shadow">
                            Confirmer
                          </button>
                        </form>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {g && (
            <Card>
              <h2 className="font-semibold">Glycémie de la journée et contexte</h2>
              {g.sensor.length ? (
                <div className="mt-2">
                  <GlucoseDayChart
                    dayStart={start.getTime()}
                    dayEnd={end.getTime()}
                    timeZone={DEMO_TIMEZONE}
                    unit="mg/dL"
                    sensor={g.sensor.map((s) => ({ t: s.at.getTime(), v: s.mgdl }))}
                    capillary={g.capillary.map((s) => ({ t: s.at.getTime(), v: s.mgdl }))}
                    events={g.events.map((e) => ({ t: e.at.getTime(), kind: e.kind, label: e.label, detail: e.detail }))}
                    targetLow={70}
                    targetHigh={180}
                    veryLow={54}
                  />
                  <Meta>Survolez une icône pour voir le détail. Les repas et événements sont ceux que vous avez notés.</Meta>
                </div>
              ) : (
                <p className="mt-2 text-sm text-ink-3">Aucune mesure de glycémie pour cette journée.</p>
              )}
            </Card>
          )}
        </div>

        <div>
          <Card className="xl:sticky xl:top-6">
            <h2 className="mb-3 font-semibold">Ajouter au journal</h2>
            {isDemo ? (
              <p className="text-sm text-ink-3">Le profil de démonstration est en lecture seule.</p>
            ) : !canWrite ? (
              <p className="text-sm text-ink-3">Vous pouvez consulter ce journal, mais pas y ajouter d’entrée.</p>
            ) : (
              <JournalForm date={formatLocalDate(day)} defaultTime={defaultTime} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
