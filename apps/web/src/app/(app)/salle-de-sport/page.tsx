import type { Metadata } from 'next';
import Link from 'next/link';
import { daysInMonth, formatLocalDate, GYM_WEEKLY_GOAL, gymMonthStats, gymStreak, gymWeekStart, gymYearStats, type GymMonthWeek } from '@bilanx/domain';
import { demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { gymHistory } from '@/lib/server/gym-data';
import { toggleGymAction } from '@/lib/server/actions';
import { Card, Meta, PageHeader, Segmented, Stat } from '@/components/ui';
import { Icon } from '@/components/icon';
import { GymSubmit } from '@/components/gym-forms';
import { GYM_INITIALS, gymDayLong, gymMonthName, gymPlural, gymWeekSentence } from '@/components/gym-shared';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Salle de sport' };
export const dynamic = 'force-dynamic';

type View = 'mois' | 'annee';
const pad = (n: number) => String(n).padStart(2, '0');
const navBtn = 'grid min-h-11 min-w-11 shrink-0 place-items-center rounded-xl text-ink-2 hover:bg-surface-2';

export default async function GymPage({ searchParams }: { searchParams: Promise<{ vue?: string; mois?: string; annee?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'activity')) return <ModuleForbidden title="Salle de sport" profileName={name} />;
  const sp = await searchParams;
  const now = new Date();
  const today = demoToday(now);
  const todayIso = formatLocalDate(today);
  const isDemo = ctx.active.kind === 'demo';
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'activity', 'write');
  const view: View = sp.vue === 'annee' ? 'annee' : 'mois';
  const minYear = today.year - 10;

  // Mois affiché (jamais dans le futur, 10 ans au plus en arrière).
  let year = today.year;
  let month = today.month;
  const m = /^(\d{4})-(\d{2})$/.exec(sp.mois ?? '');
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    year = Number(m[1]);
    month = Number(m[2]);
  }
  if (view === 'annee' && /^\d{4}$/.test(sp.annee ?? '')) year = Number(sp.annee);
  if (year * 12 + month > today.year * 12 + today.month) [year, month] = [today.year, today.month];
  if (year > today.year) year = today.year;
  if (year < minYear) [year, month] = [minYear, 1];

  const visits = await gymHistory(ctx, today, now);
  const streak = gymStreak(visits, todayIso);
  const monthHref = (y: number, mo: number) => `/salle-de-sport?vue=mois&mois=${y}-${pad(mo)}`;
  const yearHref = (y: number) => `/salle-de-sport?vue=annee&annee=${y}`;

  return (
    <div className="fade-in">
      <PageHeader title="Salle de sport" subtitle={`Objectif : ${GYM_WEEKLY_GOAL} séances par semaine`} />
      <div className="mb-4">
        <Segmented
          label="Vue"
          items={[
            { href: monthHref(year, view === 'mois' ? month : year === today.year ? today.month : 12), label: 'Mois', current: view === 'mois' },
            { href: yearHref(year), label: 'Année', current: view === 'annee' },
          ]}
        />
      </div>
      {view === 'mois' ? (
        <MonthView
          year={year}
          month={month}
          visits={visits}
          todayIso={todayIso}
          canWrite={canWrite}
          isDemo={isDemo}
          streak={streak}
          prevHref={year * 12 + month > minYear * 12 + 1 ? (month === 1 ? monthHref(year - 1, 12) : monthHref(year, month - 1)) : null}
          nextHref={year * 12 + month < today.year * 12 + today.month ? (month === 12 ? monthHref(year + 1, 1) : monthHref(year, month + 1)) : null}
        />
      ) : (
        <YearView
          year={year}
          visits={visits}
          todayIso={todayIso}
          streak={streak}
          isDemo={isDemo}
          monthHref={monthHref}
          prevHref={year > minYear ? yearHref(year - 1) : null}
          nextHref={year < today.year ? yearHref(year + 1) : null}
        />
      )}
    </div>
  );
}

function PeriodNav({ title, prevHref, nextHref, prevLabel, nextLabel }: { title: string; prevHref: string | null; nextHref: string | null; prevLabel: string; nextLabel: string }) {
  const arrow = (href: string | null, label: string, icon: 'chevronLeft' | 'chevronRight') =>
    href ? (
      <Link href={href} className={navBtn} aria-label={label}>
        <Icon name={icon} className="size-5" />
      </Link>
    ) : (
      <span className={`${navBtn} opacity-30`} aria-hidden>
        <Icon name={icon} className="size-5" />
      </span>
    );
  return (
    <nav aria-label="Période" className="mb-3 flex items-center gap-1">
      {arrow(prevHref, prevLabel, 'chevronLeft')}
      <h2 className="min-w-0 flex-1 text-center text-lg font-semibold first-letter:uppercase" aria-live="polite">
        {title}
      </h2>
      {arrow(nextHref, nextLabel, 'chevronRight')}
    </nav>
  );
}

/* ------------------------------------------------------------------ Mois */

function MonthView({
  year,
  month,
  visits,
  todayIso,
  canWrite,
  isDemo,
  streak,
  prevHref,
  nextHref,
}: {
  year: number;
  month: number;
  visits: string[];
  todayIso: string;
  canWrite: boolean;
  isDemo: boolean;
  streak: number;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const stats = gymMonthStats(visits, year, month, todayIso);
  const set = new Set(visits);
  return (
    <>
      <PeriodNav title={gymMonthName(year, month)} prevHref={prevHref} nextHref={nextHref} prevLabel="Mois précédent" nextLabel="Mois suivant" />

      {/* Rangées pleine largeur sur téléphone : cases d'au moins 44 px. */}
      <section aria-label={`Calendrier de ${gymMonthName(year, month)}`} className="-mx-2 max-w-xl sm:mx-0">
        <div aria-hidden className="grid grid-cols-[repeat(7,minmax(0,1fr))_1.75rem] gap-0.5 pb-1 pl-2 pr-1">
          {GYM_INITIALS.map((l, i) => (
            <span key={i} className="text-center text-[12px] font-medium text-ink-3">
              {l}
            </span>
          ))}
          <span />
        </div>
        <div className="space-y-1.5">
          {stats.weeks.map((w) => (
            <WeekRow key={w.start} week={w} set={set} todayIso={todayIso} canWrite={canWrite} />
          ))}
        </div>
      </section>
      <Meta className="mt-3 max-w-xl">
        {canWrite ? 'Touchez un jour pour cocher ou décocher une séance. ' : isDemo ? 'Démonstration : données fictives, en lecture seule. ' : 'Lecture seule. '}
        Trait vert : objectif atteint (3 séances ou plus dans la semaine) ; trait rouge : moins de 3.
      </Meta>

      <Card className="mt-4 max-w-xl">
        <div className="grid grid-cols-3 gap-3">
          <Stat size="md" label="Séances" value={stats.visits} hint="ce mois-ci" />
          <Stat size="md" label="Objectif atteint" value={`${stats.weeksReached} / ${stats.weeksElapsed}`} hint="semaines" />
          <Stat size="md" label="Meilleure série" value={stats.bestStreak} hint={stats.bestStreak > 1 ? 'semaines' : 'semaine'} />
        </div>
        {streak > 0 && (
          <Meta className="mt-3 border-t border-line pt-3">
            Série en cours : {gymPlural(streak, 'semaine')} d’affilée avec l’objectif atteint.
          </Meta>
        )}
      </Card>
    </>
  );
}

function WeekRow({ week, set, todayIso, canWrite }: { week: GymMonthWeek; set: Set<string>; todayIso: string; canWrite: boolean }) {
  const border = week.future ? 'border-line' : week.reached ? 'border-sage' : 'border-red';
  const countTone = week.future ? 'text-ink-3' : week.reached ? 'text-sage' : 'text-red';
  return (
    <div
      role="group"
      aria-label={gymWeekSentence(week)}
      className={`grid grid-cols-[repeat(7,minmax(0,1fr))_1.75rem] items-center gap-0.5 rounded-xl border-l-4 bg-surface py-1 pl-1 pr-1 shadow-[var(--shadow-card)] ${border}`}
    >
      {week.days.map((d, i) => {
        if (!d) return <span key={`x${i}`} />;
        const done = set.has(d);
        const isToday = d === todayIso;
        const future = d > todayIso;
        const label = `${gymDayLong(d)}${isToday ? ' (aujourd’hui)' : ''}`;
        const cls = `flex min-h-12 w-full flex-col items-center justify-center rounded-lg text-[15px] leading-none tabular ${
          done ? 'bg-sage font-semibold text-on-accent' : future ? 'text-ink-3' : 'text-ink'
        } ${isToday ? 'ring-2 ring-inset ring-petrol' : ''}`;
        const content = (
          <>
            <span>{Number(d.slice(8, 10))}</span>
            {done ? <Icon name="check" className="mt-0.5 size-4" strokeWidth={2.6} /> : <span className="mt-0.5 size-4" />}
          </>
        );
        if (canWrite && !future)
          return (
            <form key={d} action={toggleGymAction} className="contents">
              <input type="hidden" name="day" value={d} />
              <input type="hidden" name="present" value={done ? '0' : '1'} />
              <GymSubmit aria-label={label} aria-pressed={done} title={done ? 'Retirer la séance' : 'Noter une séance'} className={`${cls} ${done ? 'hover:opacity-90' : 'hover:bg-surface-2'} transition active:scale-95 disabled:opacity-60`}>
                {content}
              </GymSubmit>
            </form>
          );
        return (
          <span key={d} className={cls}>
            <span aria-hidden className="contents">
              {content}
            </span>
            <span className="sr-only">
              {label} : {done ? 'séance' : future ? 'à venir' : 'pas de séance'}
            </span>
          </span>
        );
      })}
      <span aria-hidden className={`text-center text-[13px] font-semibold tabular ${countTone}`}>
        {week.future ? '' : `${week.count}/${GYM_WEEKLY_GOAL}`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ Année */

function YearView({
  year,
  visits,
  todayIso,
  streak,
  isDemo,
  monthHref,
  prevHref,
  nextHref,
}: {
  year: number;
  visits: string[];
  todayIso: string;
  streak: number;
  isDemo: boolean;
  monthHref: (y: number, m: number) => string;
  prevHref: string | null;
  nextHref: string | null;
}) {
  const stats = gymYearStats(visits, year);
  const set = new Set(visits);
  const thisMonth = todayIso.slice(0, 7);
  return (
    <>
      <PeriodNav title={String(year)} prevHref={prevHref} nextHref={nextHref} prevLabel="Année précédente" nextLabel="Année suivante" />
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Séances" value={stats.total} hint={`en ${year}`} />
          <Stat label="Semaines réussies" value={stats.weeksReached} hint={`${GYM_WEEKLY_GOAL} séances ou plus`} />
          {streak > 0 && gymWeekStart(todayIso).startsWith(String(year)) && (
            <Stat size="md" label="Série en cours" value={gymPlural(streak, 'sem.', 'sem.')} hint="d’affilée" />
          )}
        </div>
        {isDemo && <Meta className="mt-3">Démonstration : données fictives.</Meta>}
      </Card>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.months.map((count, i) => {
          const key = `${year}-${pad(i + 1)}`;
          const future = key > thisMonth;
          const body = (
            <>
              <p className="flex items-baseline justify-between gap-2">
                <span className="font-semibold first-letter:uppercase">{gymMonthName(year, i + 1, false)}</span>
                {key === thisMonth && <span className="text-[12px] text-ink-3">en cours</span>}
              </p>
              <p className="mt-0.5 text-sm text-ink-2">{future ? 'À venir' : gymPlural(count, 'séance')}</p>
              <MonthDots year={year} month={i + 1} set={set} todayIso={todayIso} />
            </>
          );
          return (
            <li key={key}>
              {future ? (
                <div className="card block h-full p-4 text-ink-3 [&_p]:text-ink-3">{body}</div>
              ) : (
                <Link
                  href={monthHref(year, i + 1)}
                  className="card block h-full p-4 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-petrol"
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Mini-grille de points d'un mois (décorative : le nombre de séances est écrit à côté). */
function MonthDots({ year, month, set, todayIso }: { year: number; month: number; set: Set<string>; todayIso: string }) {
  const first = `${year}-${pad(month)}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const n = daysInMonth(year, month);
  return (
    <div aria-hidden className="mt-3 grid grid-cols-7 gap-1">
      {Array.from({ length: offset }, (_, i) => (
        <span key={`x${i}`} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const d = `${year}-${pad(month)}-${pad(i + 1)}`;
        return (
          <span
            key={d}
            className={`aspect-square w-full max-w-3 justify-self-center rounded-full ${set.has(d) ? 'bg-sage' : d > todayIso ? 'bg-surface-2' : 'bg-line'}`}
          />
        );
      })}
    </div>
  );
}
