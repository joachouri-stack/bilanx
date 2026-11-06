import type { Metadata } from 'next';
import {
  addDays,
  compareLocalDates,
  computeGlucoseStats,
  dayBounds,
  formatLocalDate,
  formatNumberFr,
  formatGlucose,
  GLUCOSE_CONTEXTS,
  JOURNAL_KINDS,
  MEAL_KINDS,
  parseLocalDate,
  type GlucoseContext,
  type JournalKind,
} from '@bilanx/domain';
import { DEMO_TIMEZONE, demoDay, demoToday } from '@/lib/demo-data';
import { appContext, displayUnits, moduleAllowed } from '@/lib/server/context';
import { insulin, journal } from '@/lib/server/auth';
import { glucoseDay, meterRange } from '@/lib/server/data';
import { deleteJournalAction } from '@/lib/server/actions';
import { Button, ButtonLink, Card, CardHeader, Chip, EmptyState, Meta, PageHeader, buttonClass } from '@/components/ui';
import { DayNav } from '@/components/day-nav';
import { dayHref } from '@/lib/day-href';
import { Icon, type IconName } from '@/components/icon';
import { GlucoseDayChart } from '@/components/glucose-day-chart';
import { JournalForm } from '@/components/journal-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Journal & Repas' };

interface Item {
  id: string | null;
  at: Date;
  endedAt: Date | null;
  icon: IconName;
  title: string;
  detail: string;
  source: 'journal' | 'insulin';
}

/** Icône de chaque type d'entrée (pas d'émoji dans l'interface). */
const KIND_ICON: Record<JournalKind, IconName> = {
  meal: 'meal',
  activity: 'steps',
  stress: 'journal',
  sleep: 'journal',
  illness: 'journal',
  symptom: 'journal',
  medication: 'pill',
  other: 'journal',
};
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

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
  const fmtT = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  /** « 12 h 30 » */
  const hm = (d: Date) => fmtT.format(d).replace(':', ' h ');
  const unit = displayUnits(ctx.active).glucose;

  // Chronologie : journal + injections (si autorisées) ; démonstration : événements fictifs.
  const items: Item[] = [];
  if (ctx.active.kind === 'demo') {
    for (const e of demoDay(day, now).events)
      items.push({ id: null, at: e.at, endedAt: null, icon: e.kind === 'injection' ? 'syringe' : (KIND_ICON[e.kind as JournalKind] ?? 'journal'), title: e.label, detail: e.detail, source: e.kind === 'injection' ? 'insulin' : 'journal' });
  } else {
    const pid = ctx.active.access.profileId;
    for (const r of await journal().list(ctx.user, pid, start, end))
      items.push({
        id: r.id,
        at: r.at,
        endedAt: r.endedAt,
        icon: KIND_ICON[r.kind],
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
          items.push({ id: null, at: d.at, endedAt: null, icon: 'syringe', title: `${formatNumberFr(d.units)} U · ${d.productName}`, detail: d.comment ?? 'Injection notée comme faite', source: 'insulin' });
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime());

  const showGlucose = moduleAllowed(ctx.active, 'glucose');
  const [g, meter] = showGlucose ? await Promise.all([glucoseDay(ctx, day, now), meterRange(ctx, day, day, now)]) : [null, []];
  const stats = g && g.sensor.length ? computeGlucoseStats(g.sensor, { periodStart: start, periodEnd: isToday ? now : end }) : null;
  const meals = items.filter((i) => i.source === 'journal' && Object.values(MEAL_KINDS).includes(i.title as never));
  const others = items.filter((i) => i.source === 'journal').length - meals.length;
  const injections = items.filter((i) => i.source === 'insulin').length;
  const dayIso = formatLocalDate(day);
  const defaultTime = isToday ? fmtT.format(now) : '12:00';

  return (
    <div className="fade-in">
      <PageHeader title="Journal & Repas" subtitle={`Profil : ${name}${isDemo ? ' (démonstration, données fictives)' : ''}`} />
      <Card className="mb-4">
        <DayNav
          basePath="/journal"
          param="jour"
          value={dayIso}
          max={formatLocalDate(today)}
          prevHref={dayHref('/journal', 'jour', formatLocalDate(addDays(day, -1)))}
          nextHref={!isToday ? dayHref('/journal', 'jour', formatLocalDate(addDays(day, 1))) : undefined}
          todayHref="/journal"
        />
        {canWrite && (
          <ButtonLink href="#ajouter-journal" variant="secondary" className="mt-3 w-full xl:hidden">
            Ajouter au journal
          </ButtonLink>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="La journée" />
            <div className="flex flex-wrap gap-2">
              <Chip tone="neutral">{plural(meals.length, 'repas noté', 'repas notés')}</Chip>
              <Chip tone="neutral">{plural(others, 'événement', 'événements')}</Chip>
              {moduleAllowed(ctx.active, 'insulin') && <Chip tone="neutral">{plural(injections, 'injection', 'injections')}</Chip>}
              {stats?.mean != null && (
                <Chip tone="glucose">
                  Glycémie moyenne (capteur) {formatGlucose(stats.mean, unit)} {unit} · {Math.round(stats.pctInRange)} % dans la cible
                </Chip>
              )}
              {meter.length > 0 && <Chip tone="neutral">◆ Lecteur : {plural(meter.length, 'mesure', 'mesures')}</Chip>}
            </div>
            {items.length === 0 ? (
              <div className="mt-4">
                <EmptyState title="Rien n’est noté pour cette journée." />
              </div>
            ) : (
              <ol className="mt-4 flex flex-col">
                {items.map((it, i) => (
                  <li key={`${it.source}-${it.id ?? i}`} className="flex gap-3 border-l-2 border-line pb-4 pl-4 last:pb-0">
                    <span className="-ml-[31px] grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink-2" aria-hidden>
                      <Icon name={it.icon} className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        <span className="tabular font-semibold">
                          {hm(it.at)}
                          {it.endedAt ? ` – ${hm(it.endedAt)}` : ''}
                        </span>{' '}
                        · <span className="font-medium">{it.title}</span>
                      </span>
                      {it.detail && <span className="block text-sm text-ink-2">{it.detail}</span>}
                    </span>
                    {canWrite && it.id && (
                      <details className="shrink-0 text-right">
                        <summary className={buttonClass({ variant: 'ghost', className: 'cursor-pointer list-none text-sm text-red' })}>
                          Supprimer<span className="sr-only"> l’entrée de {hm(it.at)}</span>
                        </summary>
                        <form action={deleteJournalAction} className="mt-1">
                          <input type="hidden" name="entryId" value={it.id} />
                          <input type="hidden" name="jour" value={dayIso} />
                          <Button type="submit" variant="danger" className="min-h-11 px-4 text-sm">
                            Confirmer la suppression
                          </Button>
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
              <CardHeader title="Glycémie de la journée et contexte" />
              {g.sensor.length || g.capillary.length ? (
                <>
                  <GlucoseDayChart
                    dayStart={start.getTime()}
                    dayEnd={end.getTime()}
                    timeZone={DEMO_TIMEZONE}
                    unit={unit}
                    sensor={g.sensor.map((s) => ({ t: s.at.getTime(), v: s.mgdl }))}
                    capillary={g.capillary.map((s) => ({ t: s.at.getTime(), v: s.mgdl }))}
                    events={g.events.map((e) => ({ t: e.at.getTime(), kind: e.kind, label: e.label, detail: e.detail }))}
                    targetLow={70}
                    targetHigh={180}
                    veryLow={54}
                  />
                  <Meta className="mt-1">Appuyez sur une icône pour voir le détail. Les repas et événements sont ceux que vous avez notés.</Meta>
                </>
              ) : (
                <p className="text-sm text-ink-2">Aucune mesure de glycémie pour cette journée.</p>
              )}
              {meter.length > 0 && (
                <div className="mt-3 border-t border-line pt-3">
                  <h3 className="font-medium">◆ Lecteur (doigt)</h3>
                  <ul className="mt-1">
                    {meter.map((m) => (
                      <li key={m.at.toISOString()} className="tabular">
                        {hm(m.at)} · <span className="font-semibold">{formatGlucose(m.mgdl, unit)} {unit}</span>
                        {m.context && <span className="text-sm text-ink-2"> · {GLUCOSE_CONTEXTS[m.context as GlucoseContext]}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>

        <div>
          <Card id="ajouter-journal" className="scroll-mt-20 xl:sticky xl:top-6">
            <CardHeader title="Ajouter au journal" />
            {isDemo ? (
              <p className="text-sm text-ink-2">Le profil de démonstration est en lecture seule.</p>
            ) : !canWrite ? (
              <p className="text-sm text-ink-2">Vous pouvez consulter ce journal, mais pas y ajouter d’entrée.</p>
            ) : (
              <JournalForm date={dayIso} defaultTime={defaultTime} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
