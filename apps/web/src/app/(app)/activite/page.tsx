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
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { StepsBars, type Bar } from '@/components/steps-bars';
import { AppleHealthImport, GoalForm, ManualStepsForm } from '@/components/activity-forms';
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
  const isDemo = ctx.active.kind === 'demo';
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'activity', 'write');
  const lastTo = compareLocalDates(to, today) > 0 ? today : to;

  const [goal, source, daily, hourly, manual] = await Promise.all([
    stepsGoal(ctx),
    stepsSource(ctx),
    stepsDaily(ctx, from, lastTo, now),
    view === 'jour' ? stepsHourly(ctx, day, now) : Promise.resolve(new Map<number, number>()),
    canWrite ? manualSteps(ctx) : Promise.resolve([]),
  ]);
  const days = compareLocalDates(from, today) > 0 ? [] : stepsSeries(daily, from, lastTo);
  const stats = stepsStats(days, goal);
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });
  const dd = (iso: string) => fmtLong.format(new Date(`${iso}T12:00:00Z`));
  const short = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

  let bars: Bar[] = [];
  let periodLabel = '';
  let minWidth = 0;
  let labelEvery = 1;
  let barGoal: number | null = goal;
  if (view === 'jour') {
    const { start } = dayBounds(day, DEMO_TIMEZONE);
    const fmtH = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit' });
    bars = Array.from({ length: 24 }, (_, h) => {
      const t = start.getTime() + h * 3_600_000;
      const v = hourly.get(t) ?? null;
      return { label: `${fmtH.format(t)}h`.replace(' h', 'h'), value: v, title: `${fmtH.format(t)} h : ${v === null ? 'aucune donnée' : `${formatNumberFr(v)} pas`}` };
    });
    labelEvery = 3;
    barGoal = null; // l'objectif est quotidien, pas horaire
    minWidth = 760;
    periodLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'full' }).format(start);
  } else if (view === 'annee') {
    const all = stepsSeries(daily, from, lastTo);
    const months = monthlyAverages(all);
    bars = MONTHS.map((m, i) => {
      const k = `${from.year}-${String(i + 1).padStart(2, '0')}`;
      const r = months.find((x) => x.month === k);
      const v = r?.averagePerDay != null ? Math.round(r.averagePerDay) : null;
      return { label: m, value: v, title: `${m} ${from.year} : ${v === null ? 'aucune donnée' : `${formatNumberFr(v)} pas par jour en moyenne (${r!.daysWithData} jour(s) renseigné(s))`}` };
    });
    periodLabel = `Année ${from.year} — moyenne quotidienne par mois`;
  } else {
    bars = stepsSeries(daily, from, to).map((d) => ({
      label: view === 'semaine' ? `${['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'][(new Date(`${d.date}T12:00:00Z`).getUTCDay() + 6) % 7]} ${short(d.date)}` : String(Number(d.date.slice(8, 10))),
      value: d.steps,
      title: `${dd(d.date)} : ${d.steps === null ? 'aucune donnée' : `${formatNumberFr(d.steps)} pas`}`,
    }));
    if (view === 'mois') {
      minWidth = 900;
      labelEvery = 1;
      periodLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(from.year, from.month - 1, 15)));
    } else periodLabel = `Semaine du ${dd(formatLocalDate(from))} au ${dd(formatLocalDate(to))}`;
  }
  const href = (v: View, d: LocalDate) => `/activite?vue=${v}&date=${formatLocalDate(d)}`;
  const navBtn = 'inline-grid min-h-11 min-w-11 place-items-center rounded-xl border border-line bg-surface px-3 font-medium hover:bg-surface-2';
  const hasNext = compareLocalDates(next, today) <= 0;
  // Total du jour : valeur quotidienne enregistrée (import ou saisie), sinon somme des heures.
  const dayDaily = view === 'jour' ? (daily.get(formatLocalDate(day)) ?? null) : null;
  const dayTotal = view === 'jour' ? (dayDaily ?? (hourly.size ? [...hourly.values()].reduce((a, b) => a + b, 0) : null)) : null;
  const dayManualOnly = view === 'jour' && dayDaily !== null && hourly.size === 0;
  const fmtDT = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="fade-in">
      <PageHeader
        title="Activité & Pas"
        subtitle={`Profil : ${name}${isDemo ? ' (démonstration, données fictives)' : ''}`}
        actions={
          <nav aria-label="Vue" className="inline-flex rounded-xl bg-surface-2 p-1 text-sm">
            {VIEWS.map(([v, l]) => (
              <Link key={v} href={href(v, day)} aria-current={v === view ? 'page' : undefined} className={`rounded-lg px-3 py-1.5 ${v === view ? 'bg-surface shadow-sm' : 'text-ink-3'}`}>
                {l}
              </Link>
            ))}
          </nav>
        }
      />
      {sp.efface && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Données d’activité effacées.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={href(view, prev)} className={navBtn} aria-label="Période précédente">
                ←
              </Link>
              <h2 className="min-w-[200px] flex-1 text-center font-semibold first-letter:uppercase" aria-live="polite">
                {periodLabel}
              </h2>
              {hasNext ? (
                <Link href={href(view, next)} className={navBtn} aria-label="Période suivante">
                  →
                </Link>
              ) : (
                <span className={`${navBtn} opacity-40`} aria-disabled>
                  →
                </span>
              )}
              <form action="/activite" className="flex items-center gap-2">
                <input type="hidden" name="vue" value={view} />
                <label className="sr-only" htmlFor="date">
                  Choisir une date
                </label>
                <input id="date" type="date" name="date" defaultValue={formatLocalDate(day)} max={formatLocalDate(today)} className="min-h-11 rounded-xl border border-line bg-surface px-3" />
                <button type="submit" className={navBtn}>
                  Afficher
                </button>
              </form>
            </div>
            <div className="mt-4">
              <StepsBars bars={bars} goal={barGoal} minWidth={minWidth} labelEvery={labelEvery} />
            </div>
            <Meta className="mt-1">
              {dayManualOnly ? 'Total saisi à la main pour ce jour, sans détail par heure. ' : ''}
              {view === 'annee'
                ? 'Chaque barre est une moyenne par jour, calculée sur les seuls jours renseignés du mois.'
                : 'Nombre exact au-dessus de chaque barre ; un jour ou une heure sans donnée reste vide (jamais compté comme 0).'}
              {minWidth ? ' Faites défiler horizontalement sur téléphone.' : ''}
            </Meta>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card>
              <p className="text-xs text-ink-3">{view === 'jour' ? 'Pas ce jour' : 'Moyenne par jour'}</p>
              <p className="tabular mt-1 text-3xl font-semibold">
                {view === 'jour' ? (dayTotal !== null ? formatNumberFr(dayTotal) : '—') : stats.averagePerDay === null ? '—' : formatNumberFr(Math.round(stats.averagePerDay))}
              </p>
              <Meta>{view === 'jour' ? `objectif ${formatNumberFr(goal)}` : `sur ${stats.daysWithData} jour(s) renseigné(s)`}</Meta>
            </Card>
            <Card>
              <p className="text-xs text-ink-3">Objectif atteint</p>
              <p className="tabular mt-1 text-3xl font-semibold">{view === 'jour' ? (dayTotal !== null ? (dayTotal >= goal ? 'oui' : 'non') : '—') : `${stats.goalReachedDays} j`}</p>
              <Meta>objectif : {formatNumberFr(goal)} pas</Meta>
            </Card>
            <Card>
              <p className="text-xs text-ink-3">Total de la période</p>
              <p className="tabular mt-1 text-3xl font-semibold">{stats.daysWithData ? formatNumberFr(stats.total) : '—'}</p>
              <Meta>pas</Meta>
            </Card>
            <Card>
              <p className="text-xs text-ink-3">Meilleur jour</p>
              <p className="tabular mt-1 text-3xl font-semibold">{stats.best ? formatNumberFr(stats.best.steps!) : '—'}</p>
              <Meta>{stats.best ? dd(stats.best.date) : 'aucune donnée'}</Meta>
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {canWrite && (
            <Card id="saisir-pas" className="scroll-mt-4">
              <h2 className="font-semibold">Saisir mes pas</h2>
              <p className="mb-3 mt-1 text-sm text-ink-3">Le total d’un jour, lu sur votre téléphone ou votre montre. Une nouvelle saisie pour le même jour remplace l’ancienne.</p>
              <ManualStepsForm today={formatLocalDate(today)} defaultDay={formatLocalDate(view === 'jour' ? day : today)} />
              {manual.length > 0 && (
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer text-petrol">Jours saisis à la main ({manual.length === 14 ? '14 derniers' : manual.length})</summary>
                  <ul className="mt-2 divide-y divide-line">
                    {manual.map((m) => (
                      <li key={m.day} className="flex items-center justify-between gap-2 py-1.5">
                        <span>
                          {dd(m.day)} · <span className="tabular font-medium">{formatNumberFr(m.steps)} pas</span>
                        </span>
                        <form action={removeStepsAction}>
                          <input type="hidden" name="day" value={m.day} />
                          <button type="submit" className="min-h-9 rounded-lg px-2 text-red hover:bg-red-2" aria-label={`Supprimer la saisie du ${dd(m.day)}`}>
                            Supprimer
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}
          <Card>
            <h2 className="font-semibold">Source des données</h2>
            {source ? (
              <div className="mt-2 text-sm">
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
              <p className="mt-2 text-sm text-ink-3">Aucune donnée d’activité pour ce profil.</p>
            )}
            <Meta className="mt-3">
              iPhone et Apple Watch comptent souvent les mêmes pas : pour chaque heure, BILANX retient l’appareil qui en a compté le plus, sans les
              additionner (approximation proche du calcul d’Apple Santé).
            </Meta>
          </Card>
          {canWrite && (
            <Card>
              <h2 className="mb-3 font-semibold">Importer depuis Apple Santé</h2>
              <AppleHealthImport />
            </Card>
          )}
          {canWrite && (
            <Card>
              <GoalForm goal={goal} />
            </Card>
          )}
          {canWrite && source && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-3">Effacer toutes les données d’activité (importées et saisies)</summary>
              <form action={clearActivityAction} className="mt-2">
                <button type="submit" className="rounded-lg bg-red-2 px-3 py-2 font-medium text-red">
                  Confirmer l’effacement
                </button>
              </form>
            </details>
          )}
          <Meta>Synchronisation directe avec l’Apple Watch : prévue avec l’application iPhone BILANX (V2). Android Health Connect : plus tard.</Meta>
        </div>
      </div>
    </div>
  );
}
