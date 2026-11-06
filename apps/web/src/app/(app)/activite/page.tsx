import type { Metadata } from 'next';
import Link from 'next/link';
import {
  addDays,
  compareLocalDates,
  dayBounds,
  formatLocalDate,
  formatNumberFr,
  monthlyAverages,
  parseLocalDate,
  stepsSeries,
  stepsStats,
  type LocalDate,
} from '@bilanx/domain';
import { DEMO_TIMEZONE, demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { manualSteps, stepsDaily, stepsGoal, stepsHourly, stepsSource } from '@/lib/server/activity-data';
import { clearActivityAction, removeStepsAction } from '@/lib/server/actions';
import { Button, Card, CardHeader, Chip, Meta, PageHeader, Segmented, Stat } from '@/components/ui';
import { DayNav } from '@/components/day-nav';
import { Icon } from '@/components/icon';
import { StepsBars, type Bar } from '@/components/steps-bars';
import { AppleHealthImport, GoalForm, ManualStepsForm } from '@/components/activity-forms';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Activité & Pas' };

type View = 'jour' | 'semaine' | 'mois' | 'annee';
const VIEWS: [View, string][] = [
  ['jour', 'Jour'],
  ['semaine', 'Semaine'],
  ['mois', 'Mois'],
  ['annee', 'Année'],
];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const PREV_LABEL: Record<View, string> = { jour: 'la semaine précédente', semaine: 'la semaine précédente', mois: 'le mois précédent', annee: 'l’année précédente' };

/** Bornes de la période contenant `d` pour la vue choisie (semaine du lundi au dimanche). */
function range(view: View, d: LocalDate): { from: LocalDate; to: LocalDate; prev: LocalDate; next: LocalDate } {
  if (view === 'jour') return { from: d, to: d, prev: addDays(d, -1), next: addDays(d, 1) };
  if (view === 'semaine') {
    const dow = (new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() + 6) % 7;
    const from = addDays(d, -dow);
    return { from, to: addDays(from, 6), prev: addDays(from, -7), next: addDays(from, 7) };
  }
  if (view === 'mois') {
    const from = { year: d.year, month: d.month, day: 1 };
    const to = addDays({ year: d.month === 12 ? d.year + 1 : d.year, month: d.month === 12 ? 1 : d.month + 1, day: 1 }, -1);
    return { from, to, prev: addDays(from, -1), next: addDays(to, 1) };
  }
  return { from: { year: d.year, month: 1, day: 1 }, to: { year: d.year, month: 12, day: 31 }, prev: { year: d.year - 1, month: 12, day: 31 }, next: { year: d.year + 1, month: 1, day: 1 } };
}

const plural = (n: number, one: string, many: string) => `${formatNumberFr(n)} ${n > 1 ? many : one}`;

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ vue?: string; date?: string; efface?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'activity')) return <ModuleForbidden title="Activité & Pas" profileName={name} />;
  const sp = await searchParams;
  const now = new Date();
  const today = demoToday(now);
  const view: View = (['jour', 'semaine', 'mois', 'annee'] as const).find((v) => v === sp.vue) ?? 'semaine';
  let day = (sp.date && parseLocalDate(sp.date)) || today;
  if (compareLocalDates(day, today) > 0) day = today;
  const { from, to, prev, next } = range(view, day);
  // Période de comparaison : la semaine (vues jour et semaine), le mois ou l'année précédents.
  const cmpView: View = view === 'jour' ? 'semaine' : view;
  const cmp = range(cmpView, day);
  const before = range(cmpView, cmp.prev);
  const isDemo = ctx.active.kind === 'demo';
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'activity', 'write');
  const lastTo = compareLocalDates(to, today) > 0 ? today : to;
  const cmpTo = compareLocalDates(cmp.to, today) > 0 ? today : cmp.to;

  const [goal, source, daily, cmpDaily, beforeDaily, hourly, manual] = await Promise.all([
    stepsGoal(ctx),
    stepsSource(ctx),
    stepsDaily(ctx, from, lastTo, now),
    view === 'jour' ? stepsDaily(ctx, cmp.from, cmpTo, now) : Promise.resolve(null),
    stepsDaily(ctx, before.from, before.to, now),
    view === 'jour' ? stepsHourly(ctx, day, now) : Promise.resolve(new Map<number, number>()),
    canWrite ? manualSteps(ctx) : Promise.resolve([]),
  ]);
  const days = compareLocalDates(from, today) > 0 ? [] : stepsSeries(daily, from, lastTo);
  const stats = stepsStats(days, goal);
  const cmpStats = view === 'jour' ? stepsStats(stepsSeries(cmpDaily!, cmp.from, cmpTo), goal) : stats;
  const beforeStats = stepsStats(stepsSeries(beforeDaily, before.from, before.to), goal);
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });
  const dd = (iso: string) => fmtLong.format(new Date(`${iso}T12:00:00Z`));
  const short = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
  const todayIso = formatLocalDate(today);

  let bars: Bar[] = [];
  let periodLabel = '';
  let barGoal: number | null = goal;
  let currentIndex: number | undefined;
  let currentLabel = 'Aujourd’hui (journée en cours)';
  if (view === 'jour') {
    const { start } = dayBounds(day, DEMO_TIMEZONE);
    const fmtH = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: 'numeric' });
    bars = Array.from({ length: 24 }, (_, h) => {
      const t = start.getTime() + h * 3_600_000;
      const v = hourly.get(t) ?? null;
      const hh = fmtH.format(t).replace(/\D/g, '');
      if (t <= now.getTime() && now.getTime() < t + 3_600_000) currentIndex = h;
      return { label: `${hh} h`, value: v, title: `${hh} h : ${v === null ? 'aucune donnée' : `${formatNumberFr(v)} pas`}` };
    });
    currentLabel = 'Heure en cours';
    barGoal = null; // l'objectif est quotidien, pas horaire
  } else if (view === 'annee') {
    const months = monthlyAverages(stepsSeries(daily, from, lastTo));
    bars = MONTHS.map((m, i) => {
      const k = `${from.year}-${String(i + 1).padStart(2, '0')}`;
      const r = months.find((x) => x.month === k);
      const v = r?.averagePerDay != null ? Math.round(r.averagePerDay) : null;
      return {
        label: m,
        shortLabel: m.slice(0, 1).toUpperCase(),
        value: v,
        title: `${m} ${from.year} : ${v === null ? 'aucune donnée' : `${formatNumberFr(v)} pas par jour en moyenne (${plural(r!.daysWithData, 'jour noté', 'jours notés')})`}`,
      };
    });
    if (from.year === today.year) currentIndex = today.month - 1;
    currentLabel = 'Mois en cours';
    periodLabel = `Année ${from.year} — moyenne quotidienne par mois`;
  } else {
    const series = stepsSeries(daily, from, to);
    bars = series.map((d) => {
      const wd = WEEKDAYS[(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7]!;
      return {
        label: view === 'semaine' ? `${wd} ${short(d.date)}` : String(Number(d.date.slice(8, 10))),
        shortLabel: view === 'semaine' ? wd : undefined,
        value: d.steps,
        title: `${dd(d.date)} : ${d.steps === null ? 'aucune donnée' : `${formatNumberFr(d.steps)} pas`}`,
      };
    });
    const idx = series.findIndex((d) => d.date === todayIso);
    if (idx >= 0) currentIndex = idx;
    periodLabel =
      view === 'mois'
        ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(from.year, from.month - 1, 15)))
        : `Semaine du ${dd(formatLocalDate(from))} au ${dd(formatLocalDate(to))}`;
  }
  const href = (v: View, d: LocalDate) => `/activite?vue=${v}&date=${formatLocalDate(d)}`;
  const navBtn = 'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface-2';
  const hasNext = compareLocalDates(next, today) <= 0;
  // Total du jour : valeur quotidienne enregistrée (import ou saisie), sinon somme des heures.
  const dayDaily = view === 'jour' ? (daily.get(formatLocalDate(day)) ?? null) : null;
  const dayTotal = view === 'jour' ? (dayDaily ?? (hourly.size ? [...hourly.values()].reduce((a, b) => a + b, 0) : null)) : null;
  const dayManualOnly = view === 'jour' && dayDaily !== null && hourly.size === 0;
  const fmtDT = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });

  const avg = cmpStats.averagePerDay === null ? null : Math.round(cmpStats.averagePerDay);
  const avgBefore = beforeStats.averagePerDay === null ? null : Math.round(beforeStats.averagePerDay);
  const comparison =
    avg === null
      ? 'aucun jour noté'
      : avgBefore === null
        ? `pas de donnée pour ${PREV_LABEL[view]}`
        : avg === avgBefore
          ? `identique à ${PREV_LABEL[view]}`
          : `${avg > avgBefore ? '+' : '−'}${formatNumberFr(Math.abs(avg - avgBefore))} pas par rapport à ${PREV_LABEL[view]} (${formatNumberFr(avgBefore)})`;
  const avgTitle = view === 'jour' || view === 'semaine' ? 'Moyenne de la semaine' : view === 'mois' ? 'Moyenne du mois' : 'Moyenne de l’année';

  const chart = (
    <Card>
      {view === 'jour' ? (
        <DayNav
          basePath="/activite"
          param="date"
          extraQuery="vue=jour"
          value={formatLocalDate(day)}
          max={todayIso}
          prevHref={href('jour', prev)}
          nextHref={hasNext ? href('jour', next) : undefined}
          todayHref="/activite?vue=jour"
          label="Choisir le jour"
        />
      ) : (
        <nav aria-label="Période" className="flex items-center gap-1">
          <Link href={href(view, prev)} className={navBtn} aria-label="Période précédente">
            <Icon name="chevronLeft" className="size-5" />
          </Link>
          <h2 className="min-w-0 flex-1 text-center font-semibold first-letter:uppercase" aria-live="polite">
            {periodLabel}
          </h2>
          {hasNext ? (
            <Link href={href(view, next)} className={navBtn} aria-label="Période suivante">
              <Icon name="chevronRight" className="size-5" />
            </Link>
          ) : (
            <span className={`${navBtn} opacity-40`} aria-hidden>
              <Icon name="chevronRight" className="size-5" />
            </span>
          )}
        </nav>
      )}
      <div className="mt-4">
        <StepsBars bars={bars} goal={barGoal} currentIndex={currentIndex} currentLabel={currentLabel} />
      </div>
      <Meta className="mt-2">
        {dayManualOnly ? 'Total saisi à la main pour ce jour, sans détail par heure. ' : ''}
        {view === 'annee'
          ? 'Chaque barre est une moyenne par jour, calculée sur les seuls jours notés du mois.'
          : view === 'jour'
            ? 'Une heure sans donnée reste vide : elle n’est jamais comptée comme 0.'
            : 'Un jour sans donnée reste vide : il n’est jamais compté comme 0.'}
      </Meta>
    </Card>
  );

  const tiles = (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {view === 'jour' ? (
        <>
          <Card className="col-span-2 sm:col-span-1">
            <Stat label="Pas du jour" value={dayTotal !== null ? formatNumberFr(dayTotal) : '—'} hint={dayTotal !== null ? `objectif ${formatNumberFr(goal)}` : 'aucune donnée'} />
          </Card>
          <Card>
            <Stat size="md" label="Objectif" value={dayTotal !== null ? (dayTotal >= goal ? 'Atteint' : 'Pas encore') : '—'} hint={`${formatNumberFr(goal)} pas`} />
          </Card>
        </>
      ) : (
        <>
          <Card>
            <Stat size="md" label="Objectif atteint" value={plural(stats.goalReachedDays, 'jour', 'jours')} hint={`objectif ${formatNumberFr(goal)} pas`} />
          </Card>
          <Card>
            <Stat size="md" label="Total" value={stats.daysWithData ? formatNumberFr(stats.total) : '—'} hint="pas sur la période" />
          </Card>
          <Card>
            <Stat size="md" label="Meilleur jour" value={stats.best ? formatNumberFr(stats.best.steps!) : '—'} hint={stats.best ? dd(stats.best.date) : 'aucune donnée'} />
          </Card>
        </>
      )}
      <Card className={view === 'jour' ? '' : 'order-first col-span-2 lg:order-none lg:col-span-1'}>
        <Stat
          size="md"
          label={avgTitle}
          value={avg === null ? '—' : formatNumberFr(avg)}
          unit={avg === null ? undefined : 'pas/jour'}
          hint={avg === null ? comparison : `${plural(cmpStats.daysWithData, 'jour noté', 'jours notés')} · ${comparison}`}
        />
      </Card>
    </div>
  );

  return (
    <div className="fade-in">
      <PageHeader title="Activité & Pas" />
      <div className="mb-4">
        <Segmented label="Vue" items={VIEWS.map(([v, l]) => ({ href: href(v, day), label: l, current: v === view }))} />
      </div>
      {sp.efface && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Données d’activité effacées.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[auto_1fr]">
        {canWrite && (
          <Card id="saisir-pas" className="scroll-mt-20 xl:col-start-2 xl:row-start-1">
            <CardHeader title="Saisir mes pas" />
            <p className="mb-3 text-sm text-ink-2">Le total d’un jour, lu sur votre téléphone ou votre montre. Une nouvelle saisie pour le même jour remplace l’ancienne.</p>
            <ManualStepsForm today={todayIso} defaultDay={formatLocalDate(view === 'jour' ? day : today)} />
            {manual.length > 0 && (
              <details className="group mt-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium text-petrol [&::-webkit-details-marker]:hidden">
                  <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
                  Jours saisis à la main ({manual.length === 14 ? '14 derniers' : manual.length})
                </summary>
                <ul className="mt-1 divide-y divide-line">
                  {manual.map((m) => (
                    <li key={m.day} className="flex flex-wrap items-center justify-between gap-x-2 py-1.5 text-sm">
                      <span>
                        {dd(m.day)} · <span className="tabular font-medium">{formatNumberFr(m.steps)} pas</span>
                      </span>
                      <ConfirmDelete
                        action={removeStepsAction}
                        fields={{ day: m.day }}
                        summaryAriaLabel={`Supprimer la saisie du ${dd(m.day)}`}
                        confirmAriaLabel={`Confirmer la suppression de la saisie du ${dd(m.day)}`}
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        )}
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          {chart}
          {tiles}
        </div>
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-2 xl:row-start-2">
          <Card>
            <CardHeader title="Source des données" />
            {source ? (
              <div className="text-sm">
                <p>
                  {source.label} <Chip tone="neutral">{source.status === 'demo' ? 'fictif' : source.status === 'manual' ? 'saisie' : 'import de fichier'}</Chip>
                </p>
                {source.lastImportAt && (
                  <Meta className="mt-1">
                    {source.status === 'manual' ? 'Dernière saisie' : 'Dernier import'} : {fmtDT.format(source.lastImportAt)}
                  </Meta>
                )}
                {source.status !== 'manual' && source.kinds.includes('manual') && <Meta>Certains jours ont aussi été saisis à la main.</Meta>}
                {source.dataFrom && source.dataTo && <Meta>Données du {dd(source.dataFrom)} au {dd(source.dataTo)}</Meta>}
                {source.sources.length > 0 && <Meta>Appareils : {source.sources.join(', ')}</Meta>}
                {!isDemo && <Meta className="mt-2">Aucune synchronisation automatique : saisissez vos pas ou importez un nouvel export.</Meta>}
              </div>
            ) : (
              <p className="text-sm text-ink-2">Aucune donnée d’activité pour ce profil.</p>
            )}
            <Meta className="mt-3">
              L’iPhone et l’Apple Watch comptent souvent les mêmes pas : pour chaque heure, BILANX garde l’appareil qui en a compté le plus, sans
              additionner.
            </Meta>
            <Meta className="mt-2">Bientôt : envoi automatique des pas depuis l’iPhone.</Meta>
          </Card>
          {canWrite && (
            <Card>
              <CardHeader title="Importer depuis Apple Santé" />
              <AppleHealthImport />
            </Card>
          )}
          {canWrite && (
            <Card>
              <GoalForm goal={goal} />
            </Card>
          )}
          {canWrite && source && (
            <details className="group text-sm">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-ink-2 [&::-webkit-details-marker]:hidden">
                <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
                Effacer toutes les données d’activité (importées et saisies)
              </summary>
              <form action={clearActivityAction} className="mt-2">
                <Button type="submit" variant="danger">
                  Confirmer l’effacement
                </Button>
              </form>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
