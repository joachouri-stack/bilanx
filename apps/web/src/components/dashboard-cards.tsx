/**
 * Cartes du tableau de bord (composants serveur). Les données viennent de `lib/server/dashboard-data.ts`.
 * Une carte sans donnée utile est masquée par la page ; les états vides proposent l'action pour la remplir.
 */
import Link from 'next/link';
import {
  addDays,
  compareLocalDates,
  formatGlucose,
  formatHba1c,
  formatNumberFr,
  getAnalyte,
  hba1cPercentToMmolMol,
  localDateOf,
  type GlucoseUnit,
  type LocalDate,
} from '@bilanx/domain';
import { GLUCOSE_CONTEXTS } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { DOC_SHORTCUTS, type DocShortcut } from '@/lib/document-categories';
import { DocIcon } from '@/components/documents-icons';
import type { DashboardDocs, FirstStep, GymSummary, Hba1cPoint, AppointmentsSummary, MeterSummary, SensorSummary, StepsSummary, TodaySummary, KeyMomentDay, KeyMomentKey } from '@/lib/server/dashboard-data';
import { toggleGymAction } from '@/lib/server/actions';
import { GymSubmit } from '@/components/gym-forms';
import { GYM_WEEKDAYS_SHORT, gymDayLong, gymMonthName, gymPlural, gymRemainingLabel, gymWeekSentence } from '@/components/gym-shared';
import { GLUCOSE_TARGETS, KEY_MOMENTS, frTime } from '@/lib/server/dashboard-data';
import type { LabRow } from '@/lib/server/data';
import type { IconName } from '@/components/icon';
import { ButtonLink, Card, CardHeader, Chip, Meta, RangeBar, Stat, pct, type Tone } from '@/components/ui';
import { Icon } from '@/components/icon';
import { DashboardSparkline } from '@/components/dashboard-sparkline';
import { ProgressRing } from '@/components/progress-ring';

type HbA1cUnit = '%' | 'mmol/mol';

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumberFr(n)} ${n > 1 ? many : one}`;
const dateShort = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'short' }).format(d);
const dayMonth = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric', month: 'short' }).format(d);

/** « 10 h 30 », « hier, 10 h 30 » ou « 4 nov., 10 h 30 ». */
function when(at: Date, today: LocalDate): string {
  const d = localDateOf(at, DEMO_TIMEZONE);
  if (compareLocalDates(d, today) === 0) return frTime(at);
  if (compareLocalDates(d, addDays(today, -1)) === 0) return `hier, ${frTime(at)}`;
  return `${dayMonth(at)}, ${frTime(at)}`;
}

function glucoseStatus(mgdl: number): { tone: Tone; label: string } {
  if (mgdl < GLUCOSE_TARGETS.low) return { tone: 'red', label: 'Trop bas' };
  if (mgdl > GLUCOSE_TARGETS.high) return { tone: 'amber', label: 'Trop haut' };
  return { tone: 'sage', label: 'Dans la cible' };
}

/** Comparaison avec la période précédente : flèche + écart en mots simples. */
function Trend({ delta, format, unit, period = 'les 7 jours d’avant' }: { delta: number | null; format: (v: number) => string; unit?: string; period?: string }) {
  if (delta === null) return null;
  const v = format(Math.abs(delta));
  const zero = Number(v.replace(/\s/g, '').replace(',', '.')) === 0;
  const u = unit ? ` ${unit}` : '';
  return (
    <span>
      {zero ? (
        <>
          <span aria-hidden>= </span>Stable par rapport à {period}
        </>
      ) : delta > 0 ? (
        <>
          <span aria-hidden>↑ </span>
          {v}
          {u} de plus que {period}
        </>
      ) : (
        <>
          <span aria-hidden>↓ </span>
          {v}
          {u} de moins que {period}
        </>
      )}
    </span>
  );
}

const DAY_MS = 86_400_000;
/** État vide d'une carte : une phrase et un petit bouton, sans grand encadré. */
function CompactEmpty({ text, action }: { text: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-ink-2">{text}</p>
      {action && (
        <ButtonLink href={action.href} variant="secondary">
          <Icon name="plus" className="size-5" />
          {action.label}
        </ButtonLink>
      )}
    </div>
  );
}

const sectionTitle = 'flex items-center gap-2 text-sm font-semibold text-ink-2';

/* ------------------------------------------------------------------ Premiers pas */

export function FirstStepsCard({ steps }: { steps: FirstStep[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="mb-4" accent="petrol">
      <CardHeader title="Premiers pas" tag={`${done} sur ${steps.length}`} tagTone="petrol" icon="check" iconTone="petrol" />
      <Meta className="-mt-2 mb-2">Quelques étapes pour bien démarrer. Elles se cochent toutes seules.</Meta>
      <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {steps.map((s) =>
          s.done ? (
            <li key={s.key} className="flex min-h-11 items-center gap-3 px-2 text-ink-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sage text-on-accent">
                <Icon name="check" className="size-4" />
              </span>
              <span className="line-through">{s.label}</span>
              <span className="sr-only"> : fait</span>
            </li>
          ) : (
            <li key={s.key}>
              <Link href={s.href} className="flex min-h-11 items-center gap-3 rounded-lg px-2 font-medium text-petrol hover:bg-petrol-2">
                <span className="size-7 shrink-0 rounded-full border-2 border-line" aria-hidden />
                <span className="flex-1">{s.label}</span>
                <Icon name="chevronRight" className="size-5" />
              </Link>
            </li>
          ),
        )}
      </ol>
    </Card>
  );
}

/* ------------------------------------------------------------------ Glycémie */

export function GlucoseCard({
  sensor,
  meter,
  unit,
  today,
  isDemo,
  canWrite,
}: {
  sensor: SensorSummary | null;
  meter: MeterSummary | null;
  unit: GlucoseUnit;
  today: LocalDate;
  isDemo: boolean;
  canWrite: boolean;
}) {
  const g = (v: number) => formatGlucose(v, unit);
  const range = `${g(GLUCOSE_TARGETS.low)}–${g(GLUCOSE_TARGETS.high)} ${unit}`;
  const hasData = !!sensor || !!meter;
  const header = (
    <CardHeader
      title="Glycémie"
      icon="drop"
      iconTone="glucose"
      action={
        hasData ? (
          <span className="inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
            Historique <span aria-hidden>›</span>
          </span>
        ) : undefined
      }
    />
  );
  if (!hasData)
    return (
      <Card accent="glucose">
        {header}
        <CompactEmpty text="Aucune glycémie pour l’instant." action={canWrite ? { href: '/glycemie#ajouter-glycemie', label: 'Ajouter' } : undefined} />
      </Card>
    );
  return (
    // Toute la carte mène à l'historique de la glycémie (lecteur : vue 7 jours).
    <Card href={meter && !sensor ? '/glycemie?periode=7' : '/glycemie'} accent="glucose">
      {header}
      <div className="space-y-4">
        {sensor && <SensorBlock sensor={sensor} unit={unit} isDemo={isDemo} />}

        {meter && sensor && (
          // Avec un capteur : le lecteur (doigt) tient en une ligne, la courbe du capteur reste la référence.
          <section aria-label="Lecteur (doigt)" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
            <span className="flex items-center gap-2 text-ink-2">
              <Icon name="drop" className="size-4" />
              Lecteur (doigt)
            </span>
            <span className="tabular">
              <strong className={`text-base ${glucoseLevel(meter.last.mgdl).text}`}>{g(meter.last.mgdl)}</strong> {unit}
              <span className="text-ink-3"> · {when(meter.last.at, today)}</span>
            </span>
          </section>
        )}
        {meter && !sensor && (
          <section aria-label="Lecteur (doigt)">
            {/* Même disposition que la carte Pas : deux chiffres, puis les 7 derniers jours en barres. */}
            <div className="grid grid-cols-2 gap-4">
              <Stat
                label="Dernière mesure"
                value={<span className={glucoseText(meter.last.mgdl)}>{g(meter.last.mgdl)}</span>}
                unit={unit}
                hint={`${glucoseStatus(meter.last.mgdl).label} · ${when(meter.last.at, today)}`}
              />
              <Stat
                size="md"
                label="Moyenne sur 7 jours"
                value={meter.mean7 !== null ? g(meter.mean7) : '—'}
                unit={meter.mean7 !== null ? unit : undefined}
                hint={
                  meter.mean7 !== null && meter.meanPrev7 !== null ? (
                    <Trend delta={meter.mean7 - meter.meanPrev7} format={g} unit={unit} />
                  ) : (
                    plural(meter.count7, 'mesure', 'mesures')
                  )
                }
              />
            </div>
            <MeterWeek week={meter.week} unit={unit} />
          </section>
        )}
      </div>
    </Card>
  );
}

/** Trois niveaux, comme le chiffre du bandeau : vert dans la cible, orange un peu à côté, rouge hors plage. */
function glucoseLevel(v: number): { text: string; dot: string; tone: Tone; label: string } {
  if (v >= GLUCOSE_TARGETS.low && v <= GLUCOSE_TARGETS.high) return { text: 'text-go', dot: 'var(--go)', tone: 'sage', label: 'Dans la cible' };
  if (v >= 54 && v <= 250) return { text: 'text-amber', dot: 'var(--amber)', tone: 'amber', label: v > GLUCOSE_TARGETS.high ? 'Un peu haut' : 'Un peu bas' };
  return { text: 'text-red', dot: 'var(--red)', tone: 'red', label: v > GLUCOSE_TARGETS.high ? 'Trop haut' : 'Trop bas' };
}

/** « il y a 6 min », sinon l'heure (« 22 h 55 », « hier, 22 h 55 »). */
function agoLabel(at: Date, nowMs: number, today: LocalDate): string {
  const min = Math.round((nowMs - at.getTime()) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  return `à ${when(at, today)}`;
}

/** Graduations toutes les 6 h (0 h, 6 h, 12 h, 18 h, heure de Paris) sur les 24 dernières heures. */
function sixHourTicks(from: number, to: number): { t: number; label: string }[] {
  const hourOf = new Intl.DateTimeFormat('en-GB', { timeZone: DEMO_TIMEZONE, hour: '2-digit', hourCycle: 'h23' });
  const out: { t: number; label: string }[] = [];
  for (let t = Math.ceil(from / 3_600_000) * 3_600_000; t <= to; t += 3_600_000) {
    const h = Number(hourOf.format(new Date(t)));
    if (h % 6 === 0) out.push({ t, label: `${h} h` });
  }
  return out;
}

const LEVEL_CELL: Record<Tone, string> = {
  sage: 'bg-sage-2 text-go',
  amber: 'bg-amber-2 text-amber',
  red: 'bg-red-2 text-red',
  glucose: '',
  petrol: '',
  violet: '',
  rose: '',
  indigo: '',
  neutral: '',
};

/**
 * Moments clés de la journée (réveil à jeun, avant le déjeuner, avant le dîner) : aujourd'hui en grand,
 * puis les 7 derniers jours en tableau (une case colorée par moment).
 */
function KeyMoments({ days, unit }: { days: KeyMomentDay[]; unit: GlucoseUnit }) {
  const g = (v: number) => formatGlucose(v, unit);
  const todayRow = days.at(-1);
  const wd = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow', timeZone: 'UTC' });
  const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (!todayRow) return null;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink-2">Moments clés aujourd’hui</h3>
        <ul className="grid grid-cols-4 gap-1.5">
          {(
            [
              ['Matin', ['fasting']],
              ['Midi', ['lunch', 'lunchAfter']],
              ['Après-midi', ['afternoon']],
              ['Soir', ['dinner', 'dinnerAfter']],
            ] as [string, KeyMomentKey[]][]
          ).map(([title, keys]) => (
            <li key={title} className="flex flex-col gap-1.5 rounded-xl bg-surface-2 p-1.5">
              <p className="truncate pt-0.5 text-center text-[11.5px] font-semibold text-ink-2">{title}</p>
              {keys.map((key) => {
                const k = KEY_MOMENTS.find((m) => m.key === key)!;
                const v = todayRow.values[key];
                const lvl = v.mgdl !== null ? glucoseLevel(v.mgdl) : null;
                return (
                  <div key={key} className={`${keys.length > 1 ? 'flex-1' : ''} rounded-lg px-1 py-1.5 text-center ${lvl ? LEVEL_CELL[lvl.tone] : 'bg-surface'}`}>
                    <p className="text-[11px] leading-tight text-ink-2">{key === 'fasting' ? 'À jeun' : key === 'afternoon' ? '17 h' : k.label}</p>
                    {v.mgdl !== null ? (
                      <>
                        <p className={`tabular text-lg font-bold leading-tight ${lvl!.text}`}>{g(v.mgdl)}</p>
                        <p className="text-[11px] leading-tight text-ink-3">
                          {frTime(v.at!)}
                          {v.source === 'meter' ? ' · doigt' : ''}
                        </p>
                      </>
                    ) : (
                      <p className="py-1.5 text-[12px] leading-tight text-ink-3">{v.upcoming ? 'à venir' : 'aucune mesure'}</p>
                    )}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-ink-2">7 derniers jours</h3>
        <table className="w-full table-fixed border-separate border-spacing-1 text-center">
          <caption className="sr-only">Glycémie aux moments clés des 7 derniers jours, en {unit}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[4.75rem]">
                <span className="sr-only">Moment</span>
              </th>
              {days.map((d, i) => (
                <th key={d.date} scope="col" className={`text-[12px] font-medium ${i === days.length - 1 ? 'text-ink' : 'text-ink-3'}`}>
                  <span aria-hidden>{i === days.length - 1 ? 'auj.' : wd.format(new Date(`${d.date}T12:00:00Z`)).toUpperCase()}</span>
                  <span className="sr-only">{longDay.format(new Date(`${d.date}T12:00:00Z`))}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KEY_MOMENTS.map((k) => (
              <tr key={k.key}>
                <th scope="row" className="pr-1 text-left text-[12px] font-medium leading-tight text-ink-2">
                  {k.short}
                </th>
                {days.map((d) => {
                  const v = d.values[k.key];
                  const lvl = v.mgdl !== null ? glucoseLevel(v.mgdl) : null;
                  return (
                    <td key={d.date} className={`tabular h-9 rounded-lg text-[12px] font-semibold ${lvl ? LEVEL_CELL[lvl.tone] : 'bg-surface-2 text-ink-3'}`}>
                      {v.mgdl !== null ? g(v.mgdl) : <span aria-label={v.upcoming ? 'à venir' : 'pas de mesure'}>·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Capteur : la dernière valeur en grand, les moments clés (aujourd'hui et 7 jours), puis le temps dans la cible. */
function SensorBlock({ sensor, unit, isDemo }: { sensor: SensorSummary; unit: GlucoseUnit; isDemo: boolean }) {
  const g = (v: number) => formatGlucose(v, unit);
  const nowMs = Math.max(Date.now(), sensor.last.at.getTime());
  const today = localDateOf(new Date(nowMs), DEMO_TIMEZONE);
  const lvl = glucoseLevel(sensor.last.mgdl);
  const t = sensor.today;
  return (
    <section aria-label="Capteur" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-2">Dernière mesure du capteur</p>
          <p className="tabular mt-1 leading-none">
            <span className={`text-4xl font-bold tracking-tight ${lvl.text}`}>{g(sensor.last.mgdl)}</span>
            <span className="ml-1.5 text-ink-3">{unit}</span>
          </p>
          <p className="mt-1.5 text-sm text-ink-2">{agoLabel(sensor.last.at, nowMs, today)}</p>
        </div>
        <Chip tone={lvl.tone}>{lvl.label}</Chip>
      </div>

      <KeyMoments days={sensor.moments} unit={unit} />

      {t.count > 0 && (
        <div>
          <p className="mb-1.5 text-sm">
            <strong className="tabular">{pct(t.pctInRange)}</strong> <span className="text-ink-2">du temps dans la cible aujourd’hui</span>
          </p>
          <RangeBar veryLow={t.pctVeryLow} low={t.pctLow} inRange={t.pctInRange} high={t.pctHigh} veryHigh={t.pctVeryHigh} />
          <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-3">
            <span className="whitespace-nowrap">En dessous {pct(t.pctVeryLow + t.pctLow)}</span>
            <span className="whitespace-nowrap">Dans la cible {pct(t.pctInRange)}</span>
            <span className="whitespace-nowrap">Au-dessus {pct(t.pctHigh + t.pctVeryHigh)}</span>
          </p>
          {t.coveragePct < 50 && <Meta className="mt-1">Capteur actif {pct(t.coveragePct)} de la journée : chiffres partiels.</Meta>}
        </div>
      )}
      {isDemo && <Meta>Démonstration : données fictives.</Meta>}
    </section>
  );
}

/** Couleur du chiffre selon la cible (comme la pastille). */
function glucoseText(v: number): string {
  return v < GLUCOSE_TARGETS.low ? 'text-red' : v > GLUCOSE_TARGETS.high ? 'text-amber' : 'text-glucose';
}

/** Moyenne de chaque jour des 7 derniers jours, en barres (même gabarit que les pas) ; bande verte = cible. */
function MeterWeek({ week, unit }: { week: { date: string; readings: { at: Date; mgdl: number }[] }[]; unit: GlucoseUnit }) {
  const days = week.map((d) => ({ date: d.date, n: d.readings.length, mean: d.readings.length ? d.readings.reduce((a, r) => a + r.mgdl, 0) / d.readings.length : null }));
  const max = Math.max(GLUCOSE_TARGETS.high * 1.4, ...days.map((d) => (d.mean ?? 0) * 1.1));
  const pct = (v: number) => (v / max) * 100;
  const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
  const tone = (v: number) => (v < GLUCOSE_TARGETS.low ? 'bg-red' : v > GLUCOSE_TARGETS.high ? 'bg-amber' : 'bg-sage');
  const g = (v: number) => formatGlucose(v, unit);
  const desc = days.map((d) => `${day(d.date)} : ${d.mean === null ? 'aucune mesure' : `${g(d.mean)} ${unit} (${plural(d.n, 'mesure', 'mesures')})`}`).join(', ');
  return (
    <figure className="mt-4">
      <div role="img" aria-label={`Moyenne de la glycémie de chaque jour, 7 derniers jours : ${desc}. Cible ${g(GLUCOSE_TARGETS.low)}–${g(GLUCOSE_TARGETS.high)} ${unit}.`}>
        <div className="relative flex h-28 items-end gap-1.5" aria-hidden>
          <div
            className="pointer-events-none absolute inset-x-0 rounded bg-sage-2"
            style={{ bottom: `${pct(GLUCOSE_TARGETS.low)}%`, height: `${pct(GLUCOSE_TARGETS.high) - pct(GLUCOSE_TARGETS.low)}%` }}
          />
          {days.map((d, i) => (
            <div key={d.date} className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="tabular mb-1 text-[12px] leading-none text-ink-2">{d.mean === null ? '' : g(d.mean)}</span>
              {d.mean === null ? (
                <div className="h-1 w-full rounded-full bg-surface-2" />
              ) : (
                <div
                  className={`w-full rounded-t-md ${tone(d.mean)} ${i === days.length - 1 ? 'ring-2 ring-ink-3 ring-offset-1 ring-offset-surface' : ''}`}
                  style={{ height: `${Math.max(4, pct(d.mean))}%` }}
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5" aria-hidden>
          {days.map((d, i) => (
            <span key={d.date} className={`flex-1 text-center text-[12px] ${i === days.length - 1 ? 'font-semibold text-ink' : 'text-ink-3'}`}>
              {i === days.length - 1 ? 'auj.' : day(d.date)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 text-[13px] text-ink-3">
        Moyenne de chaque jour · bande verte : cible {g(GLUCOSE_TARGETS.low)}–{g(GLUCOSE_TARGETS.high)} {unit}.
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ Bandeau d'accueil */

/** Bandeau coloré en haut du tableau de bord : salutation, date et 3 chiffres du jour au plus. */
export interface HeroItem {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  /** Ligne d'information sous le chiffre (évolution, statut, date). */
  sub?: string;
  /** Couleur de la ligne d'information (évolution HbA1c) : vert, orange, rouge. */
  subTone?: 'ok' | 'mid' | 'out';
  /** Point de couleur en haut à droite (statut de la glycémie) et son libellé pour les lecteurs d'écran. */
  dot?: 'ok' | 'mid' | 'out';
  dotLabel?: string;
  href: string;
}

const HERO_DOT: Record<NonNullable<HeroItem['dot']>, string> = { ok: 'bg-go', mid: 'bg-amber', out: 'bg-red' };
const HERO_SUB: Record<NonNullable<HeroItem['subTone']>, string> = { ok: 'text-go', mid: 'text-amber', out: 'text-red' };
/** Couleur de chaque pastille (liseré du haut, rond de l'icône). */
const HERO_TONE: Record<string, { bar: string; chip: string }> = {
  flask: { bar: 'var(--petrol)', chip: 'bg-petrol-2 text-petrol' },
  drop: { bar: 'var(--glucose)', chip: 'bg-glucose-2 text-glucose' },
  calendar: { bar: 'var(--violet)', chip: 'bg-violet-2 text-violet' },
  scale: { bar: 'var(--indigo)', chip: 'bg-indigo-2 text-indigo' },
};

/** Bandeau coloré en haut du tableau de bord : salutation, date et 3 chiffres clés au plus (cartes pleines, bien contrastées). */
export function DashboardHero({ title, subtitle, items }: { title: string; subtitle: React.ReactNode; items: HeroItem[] }) {
  return (
    <section
      aria-label="Résumé du jour"
      className="mb-4 overflow-hidden rounded-[var(--radius-card,18px)] bg-[linear-gradient(135deg,#0c4a56_0%,#13697a_55%,#1f5fa6_100%)] p-5 text-white shadow-[var(--shadow-card)] sm:p-6"
    >
      <h1 className="font-display text-[28px] font-semibold leading-tight sm:text-[34px]">{title}</h1>
      <p className="mt-1 text-white/90 first-letter:uppercase">{subtitle}</p>
      {items.length > 0 && (
        <ul className={`mt-4 grid gap-2 sm:gap-3 ${items.length >= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
          {items.map((it) => {
            const tone = HERO_TONE[it.icon] ?? HERO_TONE.flask!;
            return (
              <li key={it.label} className="min-w-0">
                <Link
                  href={it.href}
                  style={{ boxShadow: `inset 0 3px 0 ${tone.bar}, 0 6px 16px rgba(0,0,0,0.22)` }}
                  className="flex h-full min-h-[112px] flex-col rounded-2xl border border-black/5 bg-surface px-2.5 py-3 text-ink transition hover:-translate-y-0.5 active:scale-[0.98] sm:p-4"
                >
                  <span className="flex items-center gap-1 sm:gap-1.5">
                    {/* Téléphone : petite icône colorée (place pour le libellé) ; plus large : icône dans un rond coloré. */}
                    <span className={`grid shrink-0 place-items-center rounded-lg sm:size-7 ${tone.chip} max-sm:!bg-transparent`} aria-hidden>
                      <Icon name={it.icon} className="size-4" />
                    </span>
                    <span className="truncate text-[12.5px] font-semibold text-ink-2 sm:text-[13px]">{it.label}</span>
                  </span>
                  <span className="mt-auto pt-2">
                    <span className="tabular block whitespace-nowrap leading-none">
                      <span className="text-[26px] font-bold tracking-tight sm:text-3xl">{it.value}</span>
                      {it.unit && <span className="ml-1 text-[13px] font-medium text-ink-3">{it.unit}</span>}
                      {it.dot && (
                        <span className={`ml-1.5 inline-block size-3 -translate-y-1 rounded-full ${HERO_DOT[it.dot]}`} title={it.dotLabel}>
                          <span className="sr-only">{it.dotLabel}</span>
                        </span>
                      )}
                    </span>
                    {it.sub && (
                      <span className={`mt-1.5 block truncate text-[12px] leading-tight ${it.subTone ? `font-bold ${HERO_SUB[it.subTone]}` : 'font-medium text-ink-2'}`}>{it.sub}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ HbA1c */

export function Hba1cCard({ points, unit, canWrite }: { points: Hba1cPoint[]; unit: HbA1cUnit; canWrite: boolean }) {
  const latest = points.at(-1);
  const previous = points.at(-2);
  if (!latest)
    return (
      <Card accent="petrol">
        <CardHeader title="HbA1c" icon="flask" iconTone="petrol" />
        <CompactEmpty text="Aucun résultat de prise de sang." action={canWrite ? { href: '/analyses/ajouter?analyse=hba1c', label: 'Ajouter' } : undefined} />
      </Card>
    );
  const f = formatHba1c(latest.percent, unit);
  const inUnit = (p: number) => (unit === 'mmol/mol' ? hba1cPercentToMmolMol(p) : p);
  const delta = previous ? inUnit(latest.percent) - inUnit(previous.percent) : null;
  const deltaText =
    delta === null
      ? null
      : unit === 'mmol/mol'
        ? `${Math.round(delta) > 0 ? '+' : Math.round(delta) < 0 ? '−' : '±'}${formatNumberFr(Math.abs(Math.round(delta)))} mmol/mol`
        : `${delta > 0.04 ? '+' : delta < -0.04 ? '−' : '±'}${formatNumberFr(Math.abs(delta), 1)} point`;
  // Les 6 derniers résultats (≈ 18 mois pour une HbA1c tous les 3 mois), chacun à sa date réelle.
  const series = points.slice(-6);
  const end = Date.now();
  const first = series[0]!.sampledAt.getTime();
  const start = first - Math.max(15 * 86_400_000, (end - first) * 0.04);
  const vals = series.map((p) => inUnit(p.percent));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.3, unit === 'mmol/mol' ? 3 : 0.3);
  // Graduations : un repère par mois sur une courte période, sinon tous les 3 mois (année indiquée en janvier ou au début).
  const spanMonths = (end - start) / (30.4 * 86_400_000);
  const stepMonths = spanMonths <= 7 ? 1 : spanMonths <= 14 ? 2 : 3;
  const ticks: { t: number; label: string }[] = [];
  const s0 = new Date(start);
  let m = new Date(s0.getFullYear(), s0.getMonth() + 1, 1);
  while (m.getMonth() % stepMonths !== 0) m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
  for (; m.getTime() <= end; m = new Date(m.getFullYear(), m.getMonth() + stepMonths, 1)) {
    const month = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'Europe/Paris' }).format(m).replace('.', '');
    const withYear = stepMonths > 1 && (m.getMonth() < stepMonths || ticks.length === 0);
    ticks.push({ t: m.getTime(), label: withYear ? `${month} ${String(m.getFullYear()).slice(2)}` : month });
  }
  return (
    // Toute la carte mène à l'historique complet.
    <Card href="/analyses/hba1c" accent="petrol">
      <CardHeader
        title="HbA1c"
        icon="flask"
        iconTone="petrol"
        action={
          <span className="inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
            Historique <span aria-hidden>›</span>
          </span>
        }
      />
      <Stat label="Dernier résultat" value={f.value} unit={f.unit} hint={`soit ${f.other}`} />
      {previous && deltaText && (
        <p className="mt-2 text-sm text-ink-2">
          {deltaText} par rapport au {dateShort(previous.sampledAt)} ({formatHba1c(previous.percent, unit).value} {f.unit})
        </p>
      )}
      {series.length > 0 && (
        <>
          <p className="mt-3 text-sm font-medium text-ink-2">
            {series.length > 1 ? `${series.length} derniers résultats` : 'Ajoutez un résultat précédent pour voir l’évolution'}
          </p>
          <DashboardSparkline
            points={series.map((p) => ({ t: p.sampledAt.getTime(), v: inUnit(p.percent) }))}
            domain={[start, end]}
            ticks={ticks}
            min={lo - pad}
            max={hi + pad}
            dots
            color="var(--petrol)"
            height={64}
            labels={series.map((p) => formatHba1c(p.percent, unit).value)}
            label={`HbA1c sur la période : ${series.map((p) => `${formatHba1c(p.percent, unit).value} ${f.unit} le ${dateShort(p.sampledAt)}`).join(', ')}`}
          />
        </>
      )}
      <Meta className="mt-1">
        Prise de sang du {dateShort(latest.sampledAt)}
        {latest.laboratory ? ` · ${latest.laboratory}` : ''}
      </Meta>
    </Card>
  );
}

/* ------------------------------------------------------------------ Aujourd'hui */

function TodayRow({ href, icon, title, children }: { href: string; icon: 'pill' | 'syringe'; title: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
          <Icon name={icon} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          <span className="block text-sm text-ink-2">{children}</span>
        </span>
        <Icon name="chevronRight" className="size-5 text-ink-3" />
      </Link>
    </li>
  );
}

export function TodayCard({ data }: { data: TodaySummary }) {
  return (
    <Card accent="sage">
      <CardHeader title="Aujourd’hui" icon="pill" iconTone="sage" />
      <ul className="divide-y divide-line">
        {data.meds && (
          <TodayRow href="/medicaments#prises" icon="pill" title="Médicaments">
            {data.meds.planned === 0
              ? 'Aucune prise prévue aujourd’hui.'
              : `${data.meds.taken}/${data.meds.planned} ${data.meds.planned > 1 ? 'prises notées' : 'prise notée'}`}
            {data.meds.next && ` · prochaine à ${data.meds.next.time.replace(':', ' h ')}`}
          </TodayRow>
        )}
        {data.insulin && (
          <TodayRow href="/traitements#injection" icon="syringe" title="Insuline">
            {data.insulin.count === 0
              ? 'Aucune injection notée aujourd’hui.'
              : `${plural(data.insulin.count, 'injection notée', 'injections notées')} · ${formatNumberFr(data.insulin.total)} U au total`}
          </TodayRow>
        )}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ Rendez-vous */

/** Agenda : prochains rendez-vous (et le dernier passé) ; toute la carte mène à tous les rendez-vous. */
export function AppointmentCard({ data, now }: { data: AppointmentsSummary; now: Date }) {
  const rel = (d: Date) => {
    const days = Math.round((Date.UTC(...ymd(d)) - Date.UTC(...ymd(now))) / 86_400_000);
    return days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : days > 0 ? `dans ${days} jours` : days === -1 ? 'hier' : `il y a ${-days} jours`;
  };
  const wd = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(/\./g, '');
  const more = data.upcomingTotal - data.upcoming.length;
  return (
    <Card href="/rendez-vous" accent="violet">
      <CardHeader
        title="Rendez-vous"
        icon="calendar"
        iconTone="violet"
        action={
          <span className="inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
            Tous <span aria-hidden>›</span>
          </span>
        }
      />
      {data.upcoming.length === 0 ? (
        <p className="text-sm text-ink-2">Aucun rendez-vous à venir.</p>
      ) : (
        <ol className="space-y-3">
          {data.upcoming.map((a, i) => (
            <li key={a.id ?? i} className="flex items-center gap-3">
              <DateTile date={a.startsAt} highlight={i === 0} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold first-letter:uppercase">{a.title}</p>
                <p className="text-sm text-ink-2 first-letter:uppercase">
                  {wd(a.startsAt)} · {a.time} · <span className="text-ink-3">{rel(a.startsAt)}</span>
                </p>
                {i === 0 && a.toPrepare && <p className="mt-0.5 truncate text-sm text-ink-3">À préparer : {a.toPrepare}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {more > 0 && <Meta className="mt-3">Et {more === 1 ? 'un autre rendez-vous' : `${more} autres rendez-vous`} à venir.</Meta>}
      {data.last && (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-3">
          Dernier : <span className="text-ink-2 first-letter:uppercase">{data.last.title}</span>, {wd(data.last.startsAt)} ({rel(data.last.startsAt)})
        </p>
      )}
    </Card>
  );
}

/** Petite page de calendrier : jour en grand, mois en dessous. */
function DateTile({ date, highlight }: { date: Date; highlight: boolean }) {
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric' }).format(date);
  const month = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, month: 'short' }).format(date).replace('.', '');
  return (
    <span
      aria-hidden
      className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-xl border ${highlight ? 'border-petrol bg-petrol-2 text-petrol' : 'border-line bg-surface-2 text-ink-2'}`}
    >
      <span className="tabular text-xl font-semibold leading-none">{day}</span>
      <span className="mt-0.5 text-[12px] uppercase leading-none">{month}</span>
    </span>
  );
}

function ymd(d: Date): [number, number, number] {
  const p = localDateOf(d, DEMO_TIMEZONE);
  return [p.year, p.month - 1, p.day];
}

/* ------------------------------------------------------------------ Pas */

export function StepsCard({ steps, canWrite, isDemo }: { steps: StepsSummary; canWrite: boolean; isDemo: boolean }) {
  const empty = steps.today === null && steps.mean7 === null && steps.meanPrev7 === null;
  if (empty)
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sage-2 text-sage">
              <Icon name="steps" className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-6">Pas</h2>
              <p className="text-sm text-ink-2">Aucun pas noté ces 14 derniers jours.</p>
            </div>
          </div>
          {canWrite && <ButtonLink href="/activite#saisir-pas">Saisir mes pas</ButtonLink>}
        </div>
      </Card>
    );
  const ratio = steps.today !== null ? steps.today / steps.goal : 0;
  return (
    // Toute la carte mène à l'historique (jour, semaine, mois, année).
    <Card href="/activite" accent="sage">
      <CardHeader
        title="Pas"
        icon="steps"
        iconTone="sage"
        action={
          <span className="inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
            Historique <span aria-hidden>›</span>
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Aujourd’hui"
          value={steps.today !== null ? formatNumberFr(steps.today) : '—'}
          hint={steps.today !== null ? `${Math.round(ratio * 100)} % de l’objectif` : 'Pas encore noté'}
        />
        {steps.mean7 !== null && (
          <Stat
            size="md"
            label="Moyenne sur 7 jours"
            value={formatNumberFr(Math.round(steps.mean7))}
            hint={
              steps.meanPrev7 !== null ? (
                <Trend delta={Math.round(steps.mean7 - steps.meanPrev7)} format={(v) => formatNumberFr(v)} unit="pas" />
              ) : steps.days7 < 7 ? (
                plural(steps.days7, 'jour noté', 'jours notés')
              ) : undefined
            }
          />
        )}
      </div>
      <WeekBars week={steps.week} goal={steps.goal} />
      {isDemo && <Meta className="mt-2">Démonstration : données fictives.</Meta>}
    </Card>
  );
}

/** Les 7 derniers jours en barres (HTML, sans graphique à charger) ; trait pointillé = objectif. */
function WeekBars({ week, goal }: { week: { date: string; steps: number | null }[]; goal: number }) {
  const max = Math.max(goal * 1.15, ...week.map((d) => d.steps ?? 0));
  const day = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
  const short = (v: number) => (v >= 10_000 ? `${formatNumberFr(Math.round(v / 1000))} k` : v >= 1000 ? `${formatNumberFr(Math.round(v / 100) / 10)} k` : formatNumberFr(v));
  const goalPct = (goal / max) * 100;
  const label = week.map((d) => `${day(d.date)} : ${d.steps === null ? 'non noté' : `${formatNumberFr(d.steps)} pas`}`).join(', ');
  return (
    <figure className="mt-4">
      <div role="img" aria-label={`Pas des 7 derniers jours : ${label}. Objectif ${formatNumberFr(goal)} pas.`} className="relative">
        <div className="relative flex h-28 items-end gap-1.5" aria-hidden>
          <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink-3/60" style={{ bottom: `${goalPct}%` }} />
          {week.map((d, i) => {
            const today = i === week.length - 1;
            const reached = d.steps !== null && d.steps >= goal;
            return (
              <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                <span className="tabular mb-1 text-[12px] leading-none text-ink-2">{d.steps === null ? '' : short(d.steps)}</span>
                {d.steps === null ? (
                  <div className="h-1 w-full rounded-full bg-surface-2" />
                ) : (
                  <div
                    className={`w-full rounded-t-md ${reached ? 'bg-sage' : 'bg-amber'} ${today ? `ring-2 ${reached ? 'ring-sage' : 'ring-amber'} ring-offset-1 ring-offset-surface` : ''}`}
                    style={{ height: `${Math.max(4, (d.steps / max) * 100)}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5" aria-hidden>
          {week.map((d, i) => (
            <span key={d.date} className={`flex-1 text-center text-[12px] ${i === week.length - 1 ? 'font-semibold text-ink' : 'text-ink-3'}`}>
              {i === week.length - 1 ? 'auj.' : day(d.date)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 text-[13px] text-ink-3">Pointillés : objectif de {formatNumberFr(goal)} pas par jour. Orange : non atteint.</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ Salle de sport */

/**
 * Salle de sport : séances de la semaine (objectif 3), bouton « J’y suis allé aujourd’hui », mini calendrier du mois.
 * Toute la carte mène à l’historique : lien « étiré » sous le contenu, formulaire au-dessus (pas de lien imbriqué).
 */
export function GymCard({ gym, canWrite, isDemo }: { gym: GymSummary; canWrite: boolean; isDemo: boolean }) {
  const { week, days, month, today } = gym;
  const visits = new Set(gym.visits);
  return (
    <Card accent="sage" className="relative transition-transform hover:-translate-y-0.5">
      <Link
        href="/salle-de-sport"
        aria-label="Historique de la salle de sport"
        className="absolute inset-0 z-0 rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-petrol"
      />
      <CardHeader
        title="Salle de sport"
        icon="dumbbell"
        iconTone="sage"
        action={
          <span className="inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
            Historique <span aria-hidden>›</span>
          </span>
        }
      />

      {/* Semaine : anneau de progression vers l'objectif, statut, série. */}
      <div className="flex items-center gap-4">
        <ProgressRing value={week.count / week.goal} size={96} stroke={10} colors={week.reached ? ['#34d399', '#22d3ee'] : ['#fbbf24', '#fb7185']}>
          <p className="tabular text-2xl font-bold leading-none">
            {week.count}
            <span className="text-base font-semibold text-ink-3">/{week.goal}</span>
          </p>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-2">Cette semaine</p>
          <p className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${week.reached ? 'bg-sage-2 text-go' : 'bg-amber-2 text-amber'}`}>
            {week.reached && <Icon name="check" className="size-3.5" strokeWidth={2.6} />}
            {gymRemainingLabel(week)}
          </p>
          {gym.streak > 0 && <p className="mt-1.5 text-[13px] text-ink-2">🔥 {gymPlural(gym.streak, 'semaine')} d’affilée</p>}
        </div>
      </div>

      {/* Jours de la semaine : un appui coche ou décoche le jour directement (au-dessus du lien de la carte). */}
      <ol className="relative z-10 mt-4 grid grid-cols-7 gap-1" aria-label="Séances de la semaine en cours">
        {days.map((d, i) => {
          const isToday = d.date === today;
          const future = d.date > today;
          const missed = !d.done && !future && !isToday;
          const circle = `grid size-11 place-items-center rounded-full transition ${
            d.done
              ? 'bg-[linear-gradient(135deg,#34d399,#10b981)] text-white shadow-[0_4px_12px_rgba(16,185,129,0.35)]'
              : future
                ? 'bg-surface-2 text-ink-3 opacity-50'
                : isToday
                  ? 'border-2 border-dashed border-petrol text-petrol'
                  : 'bg-red-2 text-red'
          }`;
          const label = `${gymDayLong(d.date)}${isToday ? ' (aujourd’hui)' : ''}`;
          const mark = d.done ? (
            <Icon name="close" className="size-5" strokeWidth={3} />
          ) : missed ? (
            <Icon name="close" className="size-4" strokeWidth={2.6} />
          ) : isToday ? (
            <Icon name="plus" className="size-5" strokeWidth={2.4} />
          ) : null;
          return (
            <li key={d.date} className="flex flex-col items-center gap-1">
              {canWrite && !future ? (
                <form action={toggleGymAction}>
                  <input type="hidden" name="day" value={d.date} />
                  <input type="hidden" name="present" value={d.done ? '0' : '1'} />
                  <GymSubmit
                    className={`${circle} cursor-pointer active:scale-90`}
                    aria-pressed={d.done}
                    aria-label={`${label} : ${d.done ? 'séance notée, appuyer pour la retirer' : 'appuyer pour noter une séance'}`}
                  >
                    {mark}
                  </GymSubmit>
                </form>
              ) : (
                <>
                  <span aria-hidden className={circle}>
                    {mark}
                  </span>
                  <span className="sr-only">
                    {label} : {d.done ? 'séance' : future ? 'à venir' : 'pas de séance'}
                  </span>
                </>
              )}
              <span aria-hidden className={`text-[11px] ${isToday ? 'font-bold text-petrol' : 'text-ink-3'}`}>
                {isToday ? 'auj.' : GYM_WEEKDAYS_SHORT[i]!.replace('.', '')}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Mois : une pastille par semaine (verte si l'objectif est atteint). */}
      <GymMonthStrip month={month} />
      {isDemo && <Meta className="mt-2">Démonstration : données fictives.</Meta>}
    </Card>
  );
}

/** Mois en cours : nombre de séances et une pastille par semaine (verte : objectif atteint, rouge : manqué). */
function GymMonthStrip({ month }: { month: GymSummary['month'] }) {
  const name = gymMonthName(month.year, month.month, false);
  const weeks = month.weeks.filter((w) => !w.future);
  return (
    <div className="mt-4 border-t border-line pt-3" role="img" aria-label={`${name} : ${gymPlural(month.visits, 'séance')}. ${month.weeks.map(gymWeekSentence).join('. ')}.`}>
      <div className="flex items-baseline justify-between gap-3 text-sm" aria-hidden>
        <span className="font-semibold first-letter:uppercase">{name}</span>
        <span className="text-ink-2">{gymPlural(month.visits, 'séance')}</span>
      </div>
      <div className="mt-2 flex gap-1.5" aria-hidden>
        {weeks.map((w, i) => (
          <span
            key={w.start}
            className={`tabular flex flex-1 flex-col items-center rounded-xl py-1.5 text-[12px] font-semibold ${
              w.reached ? 'bg-sage-2 text-go' : w.current ? 'bg-surface-2 text-ink-2 ring-1 ring-petrol' : 'bg-red-2 text-red'
            }`}
          >
            <span className="text-[11px] font-semibold">S{i + 1}</span>
            {w.count}/{w.goal}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ À surveiller */

function SoftGauge({ value, low, high, label }: { value: number; low: number | null; high: number | null; label: string }) {
  const lo = low ?? 0;
  const hi = high ?? (low !== null ? low * 2 : value * 2);
  const span = Math.max(hi - lo, Math.abs(hi) * 0.1, 1e-6);
  const min = Math.max(0, Math.min(value, lo - span * 0.6));
  const max = Math.max(value, hi + span * 0.6);
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  return (
    <div className="relative mt-2 h-2 rounded-full bg-surface-2" role="img" aria-label={label}>
      <div className="absolute inset-y-0 rounded-full bg-sage-2" style={{ left: `${pos(lo)}%`, width: `${pos(hi) - pos(lo)}%` }} />
      <div
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-amber"
        style={{ left: `${Math.min(98, Math.max(2, pos(value)))}%` }}
      />
    </div>
  );
}

export function WatchCard({ watch }: { watch: LabRow[] }) {
  if (!watch.length)
    return (
      <Card>
        <p className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sage-2 text-sage">
            <Icon name="check" className="size-4" />
          </span>
          <span className="min-w-0 flex-1 text-ink-2">Vos derniers résultats sont dans les valeurs de référence.</span>
          <Link href="/analyses" className="inline-flex min-h-11 items-center text-sm font-medium text-petrol hover:underline">
            Analyses
          </Link>
        </p>
      </Card>
    );
  return (
    <Card accent="amber">
      <CardHeader
        title="À surveiller"
        icon="flask"
        iconTone="amber"
        action={
          <Link href="/analyses" className="inline-flex min-h-11 items-center font-medium text-petrol hover:underline">
            Analyses
          </Link>
        }
      />
      <Meta className="-mt-2 mb-1">En dehors des valeurs de référence du laboratoire. À évoquer avec votre médecin.</Meta>
      <ul className="divide-y divide-line">
        {watch.map((r) => {
          const a = getAnalyte(r.analyteCode)!;
          const above = r.refHigh !== null && r.value > r.refHigh;
          const ref = r.refLow !== null && r.refHigh !== null ? `${formatNumberFr(r.refLow)}–${formatNumberFr(r.refHigh)}` : r.refHigh !== null ? `moins de ${formatNumberFr(r.refHigh)}` : `plus de ${formatNumberFr(r.refLow ?? 0)}`;
          return (
            <li key={r.analyteCode}>
              <Link href={`/analyses/${r.analyteCode}`} className="-mx-2 block rounded-lg px-2 py-3 hover:bg-surface-2">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{a.nameFr}</span>
                  <span>
                    <strong className="tabular">{formatNumberFr(r.value)}</strong> <span className="text-sm text-ink-3">{r.unit}</span>
                  </span>
                </span>
                <SoftGauge
                  value={r.value}
                  low={r.refLow}
                  high={r.refHigh}
                  label={`${formatNumberFr(r.value)} ${r.unit}, valeurs de référence ${ref} ${r.unit}`}
                />
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Chip tone="amber">{above ? 'Au-dessus' : 'En dessous'}</Chip>
                  <span className="text-[13px] text-ink-3">
                    Référence {ref} · {dateShort(r.sampledAt)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ Résumé */

export function SummaryCard({ sentences }: { sentences: React.ReactNode[] }) {
  return (
    <Card accent="petrol">
      <CardHeader title="Résumé de la semaine" icon="sparkle" iconTone="petrol" />
      <div className="space-y-1.5 text-ink-2">
        {sentences.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
      <Meta className="mt-2">Résumé de vos données, sans interprétation médicale.</Meta>
    </Card>
  );
}

/* ------------------------------------------------------------------ Documents */

const SHORTCUT_TONES: Record<DocShortcut['tone'], string> = {
  amber: 'bg-amber-2 text-amber',
  petrol: 'bg-petrol-2 text-petrol',
  glucose: 'bg-glucose-2 text-glucose',
  sage: 'bg-sage-2 text-sage',
  neutral: 'bg-surface-2 text-ink-2',
};

/**
 * Raccourcis par type de document : chaque tuile ouvre la liste filtrée (du plus récent au plus ancien)
 * et indique combien de documents elle contient. Affichée même sans document (« Aucun »).
 */
export function DocumentsCard({ docs }: { docs: DashboardDocs }) {
  return (
    // Toute la carte (en dehors des dossiers) mène à tous les documents.
    <Card accent="rose" className="relative transition-transform hover:-translate-y-0.5">
      <Link
        href="/documents"
        aria-label="Ouvrir la page Documents"
        tabIndex={-1}
        className="absolute inset-0 z-0 rounded-[var(--radius-card)] focus-visible:outline-2 focus-visible:outline-petrol"
      />
      <CardHeader
        title="Documents"
        icon="folder"
        iconTone="rose"
        action={
          <span className="inline-flex min-h-11 items-center gap-1 font-medium text-petrol">
            Tous <span aria-hidden>›</span>
          </span>
        }
      />
      <ul className="relative z-10 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {DOC_SHORTCUTS.map((s) => {
          const n = docs.counts[s.key] ?? 0;
          return (
            <li key={s.key} className="min-w-0">
              {/* Ligne compacte : icône, libellé, nombre (seulement s'il y a des documents ; « Aucun » reste lu par les lecteurs d'écran). */}
              <Link
                href={s.href}
                className="flex h-full min-h-14 items-center gap-2 rounded-xl border border-line px-2 py-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-petrol"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${SHORTCUT_TONES[s.tone]}`} aria-hidden>
                  <DocIcon name={s.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold leading-tight">{s.label}</span>
                {n > 0 ? (
                  <span data-count className="tabular shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[13px] font-semibold text-ink-2">
                    {n}
                    <span className="sr-only">{n > 1 ? ' documents' : ' document'}</span>
                  </span>
                ) : (
                  <span data-count className="sr-only">
                    Aucun
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="relative z-10 mt-2 flex justify-center">
        <ButtonLink href="/documents" variant="ghost">
          Tous les documents
        </ButtonLink>
      </div>
    </Card>
  );
}
