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
import { documentTitle } from '@/lib/document-categories';
import type { DashboardDoc, FirstStep, Hba1cPoint, MeterSummary, NextAppointment, SensorSummary, StepsSummary, TodaySummary } from '@/lib/server/dashboard-data';
import { GLUCOSE_TARGETS, frTime } from '@/lib/server/dashboard-data';
import type { LabRow } from '@/lib/server/data';
import { ButtonLink, Card, CardHeader, Chip, EmptyState, Meta, RangeBar, Stat, pct, type Tone } from '@/components/ui';
import { Icon } from '@/components/icon';
import { DashboardSparkline } from '@/components/dashboard-sparkline';

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

const sectionTitle = 'flex items-center gap-2 text-sm font-semibold text-ink-2';

/* ------------------------------------------------------------------ Premiers pas */

export function FirstStepsCard({ steps }: { steps: FirstStep[] }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="mb-4">
      <CardHeader title="Premiers pas" tag={`${done} sur ${steps.length}`} tagTone="petrol" />
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
  return (
    <Card>
      <CardHeader
        title="Glycémie"
        action={
          <Link href="/glycemie" className="inline-flex min-h-11 items-center font-medium text-petrol hover:underline">
            Détails
          </Link>
        }
      />
      {!sensor && !meter && (
        <EmptyState
          title="Aucune glycémie enregistrée"
          description="Notez la valeur de votre lecteur, ou importez les mesures de votre capteur."
          action={canWrite ? <ButtonLink href="/glycemie#ajouter-glycemie" variant="primary">Ajouter une glycémie</ButtonLink> : undefined}
        />
      )}
      <div className="space-y-5">
        {sensor && (
          <section aria-label="Capteur">
            {meter && (
              <h3 className={`${sectionTitle} mb-2`}>
                <Icon name="chart" className="size-4" />
                Capteur
              </h3>
            )}
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <Stat
                label="Dernière mesure"
                value={<span className="text-glucose">{g(sensor.last.mgdl)}</span>}
                unit={unit}
                hint={`Capteur · ${when(sensor.last.at, today)}`}
              />
              <Stat label="Dans la cible" value={sensor.stats14.count ? pct(sensor.stats14.pctInRange) : '—'} size="md" hint="14 derniers jours" />
            </div>
            <div className="mt-2">
              <Chip tone={glucoseStatus(sensor.last.mgdl).tone}>{glucoseStatus(sensor.last.mgdl).label}</Chip>
            </div>
            {sensor.curve.length > 1 && (
              <>
                <DashboardSparkline
                  points={sensor.curve}
                  min={40}
                  max={300}
                  band={[GLUCOSE_TARGETS.low, GLUCOSE_TARGETS.high]}
                  label={`Courbe du capteur sur les dernières 24 heures, cible ${range}`}
                />
                <Meta>Dernières 24 h · bande verte : cible</Meta>
              </>
            )}
            <RangeBar
              veryLow={sensor.stats14.pctVeryLow}
              low={sensor.stats14.pctLow}
              inRange={sensor.stats14.pctInRange}
              high={sensor.stats14.pctHigh}
              veryHigh={sensor.stats14.pctVeryHigh}
            />
            <Meta>
              Trop bas {pct(sensor.stats14.pctVeryLow + sensor.stats14.pctLow)} · trop haut {pct(sensor.stats14.pctHigh + sensor.stats14.pctVeryHigh)} · cible {range}
            </Meta>
            {sensor.stats14.coveragePct < 70 && (
              <Meta className="mt-1">Mesures sur {pct(sensor.stats14.coveragePct)} du temps seulement : chiffres à lire avec prudence.</Meta>
            )}
            {isDemo && <Meta className="mt-1">Démonstration : données fictives.</Meta>}
          </section>
        )}

        {meter && (
          <section aria-label="Lecteur (doigt)" className={sensor ? 'border-t border-line pt-4' : ''}>
            {sensor && (
              <h3 className={`${sectionTitle} mb-2`}>
                <Icon name="drop" className="size-4" />
                Lecteur (doigt)
              </h3>
            )}
            <Stat
              label="Dernière mesure"
              value={<span className="text-glucose">{g(meter.last.mgdl)}</span>}
              unit={unit}
              hint={`Lecteur (doigt) · ${when(meter.last.at, today)}${meter.last.context ? ` · ${GLUCOSE_CONTEXTS[meter.last.context]}` : ''}`}
            />
            <div className="mt-2">
              <Chip tone={glucoseStatus(meter.last.mgdl).tone}>{glucoseStatus(meter.last.mgdl).label}</Chip>
            </div>
            {meter.count7 > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                <Stat
                  size="md"
                  label="Moyenne sur 7 jours"
                  value={meter.mean7 !== null ? g(meter.mean7) : '—'}
                  unit={unit}
                  hint={
                    meter.mean7 !== null && meter.meanPrev7 !== null ? (
                      <Trend delta={meter.mean7 - meter.meanPrev7} format={g} unit={unit} />
                    ) : undefined
                  }
                />
                <Stat size="md" label="Mesures" value={formatNumberFr(meter.count7)} hint="7 derniers jours" />
                {meter.fasting7 !== null && <Stat size="md" label="À jeun (moyenne)" value={g(meter.fasting7)} unit={unit} />}
                {meter.afterMeal7 !== null && <Stat size="md" label="Après un repas (moyenne)" value={g(meter.afterMeal7)} unit={unit} />}
              </div>
            ) : (
              <Meta className="mt-2">Aucune mesure ces 7 derniers jours.</Meta>
            )}
          </section>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ HbA1c */

export function Hba1cCard({ points, unit, canWrite }: { points: Hba1cPoint[]; unit: HbA1cUnit; canWrite: boolean }) {
  const latest = points.at(-1);
  const previous = points.at(-2);
  if (!latest)
    return (
      <Card>
        <CardHeader title="HbA1c" tag="Laboratoire" tagTone="petrol" />
        <EmptyState
          title="Aucune HbA1c enregistrée"
          description="L’HbA1c se mesure par une prise de sang au laboratoire."
          action={canWrite ? <ButtonLink href="/analyses/ajouter?analyse=hba1c" variant="primary">Ajouter une HbA1c</ButtonLink> : undefined}
        />
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
  const series = points.slice(-6);
  const vals = series.map((p) => inUnit(p.percent));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.3, unit === 'mmol/mol' ? 3 : 0.3);
  return (
    <Card>
      <CardHeader
        title="HbA1c"
        tag="Laboratoire"
        tagTone="petrol"
        action={
          <Link href="/analyses/hba1c" className="inline-flex min-h-11 items-center font-medium text-petrol hover:underline">
            Historique
          </Link>
        }
      />
      <Stat label="Dernier résultat" value={f.value} unit={f.unit} hint={`soit ${f.other}`} />
      {previous && deltaText && (
        <p className="mt-2 text-sm text-ink-2">
          {deltaText} par rapport au {dateShort(previous.sampledAt)} ({formatHba1c(previous.percent, unit).value} {f.unit})
        </p>
      )}
      {series.length > 1 && (
        <DashboardSparkline
          points={series.map((p, i) => ({ t: i, v: inUnit(p.percent) }))}
          min={lo - pad}
          max={hi + pad}
          dots
          color="var(--petrol)"
          height={52}
          labels={series.map((p) => formatHba1c(p.percent, unit).value)}
          label={`Dernières HbA1c : ${series.map((p) => `${formatHba1c(p.percent, unit).value} ${f.unit} le ${dateShort(p.sampledAt)}`).join(', ')}`}
        />
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
    <Card>
      <CardHeader title="Aujourd’hui" />
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

export function AppointmentCard({ appt, now, showReport }: { appt: NextAppointment; now: Date; showReport: boolean }) {
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(appt.startsAt);
  const days = Math.round(
    (Date.UTC(...ymd(appt.startsAt)) - Date.UTC(...ymd(now))) / 86_400_000,
  );
  return (
    <Card>
      <CardHeader
        title="Prochain rendez-vous"
        action={
          <Link href="/rendez-vous" className="inline-flex min-h-11 items-center font-medium text-petrol hover:underline">
            Tous
          </Link>
        }
      />
      {appt.id ? (
        <Link href={`/rendez-vous/${appt.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
          {appt.title}
        </Link>
      ) : (
        <p className="font-semibold">{appt.title}</p>
      )}
      <p className="first-letter:uppercase">
        {date} · {appt.time}
      </p>
      <Meta>{days <= 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : `Dans ${days} jours`}</Meta>
      {appt.toPrepare && <p className="mt-2 text-sm text-ink-2">À préparer : {appt.toPrepare}</p>}
      {showReport && (
        <div className="mt-4">
          <ButtonLink href="/rapports">
            <Icon name="share" className="size-5" />
            Préparer le rapport
          </ButtonLink>
        </div>
      )}
    </Card>
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
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sage-2 text-sage">
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
    <Card>
      <CardHeader
        title="Pas"
        action={
          <Link href="/activite" className="inline-flex min-h-11 items-center font-medium text-petrol hover:underline">
            Détails
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {steps.today !== null && (
          <div className="min-w-0">
            <Stat label="Aujourd’hui" value={formatNumberFr(steps.today)} hint={`${Math.round(ratio * 100)} % de l’objectif`} />
            <div className="mt-2 h-2 rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-sage" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
            </div>
          </div>
        )}
        {steps.mean7 !== null && (
          <Stat
            size={steps.today !== null ? 'md' : 'lg'}
            label="Moyenne sur 7 jours"
            value={formatNumberFr(Math.round(steps.mean7))}
            hint={
              <>
                {steps.meanPrev7 !== null && (
                  <>
                    <Trend delta={Math.round(steps.mean7 - steps.meanPrev7)} format={(v) => formatNumberFr(v)} unit="pas" />
                    <br />
                  </>
                )}
                Objectif {formatNumberFr(steps.goal)} par jour
                {steps.days7 < 7 ? ` · ${plural(steps.days7, 'jour noté', 'jours notés')}` : ''}
              </>
            }
          />
        )}
      </div>
      {steps.today === null && canWrite && (
        <div className="mt-3">
          <ButtonLink href="/activite#saisir-pas" variant="ghost">
            Saisir mes pas du jour
          </ButtonLink>
        </div>
      )}
      {isDemo && <Meta className="mt-2">Démonstration : données fictives.</Meta>}
    </Card>
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
    <Card>
      <CardHeader
        title="À surveiller"
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
    <Card>
      <CardHeader title="Résumé" />
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

export function DocumentsRow({ docs }: { docs: DashboardDoc[] }) {
  const fmt = (d: DashboardDoc) =>
    d.document_date
      ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short' }).format(new Date(`${d.document_date}T12:00:00Z`))
      : `Ajouté le ${dateShort(d.uploaded_at)}`;
  return (
    <Card>
      <CardHeader title="Derniers documents" />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {docs.map((d) => (
          <li key={d.id} className="min-w-0">
            <Link href={`/documents/${d.id}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-surface-2">
              <Icon name={d.kind === 'prescription' ? 'prescription' : 'document'} className="size-5 shrink-0 text-ink-3" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{documentTitle(d)}</span>
                <span className="block text-[13px] text-ink-3">{fmt(d)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-x-2">
        <ButtonLink href="/documents" variant="ghost">
          Tous les documents
        </ButtonLink>
        <ButtonLink href="/ordonnances" variant="ghost">
          <Icon name="prescription" className="size-5" />
          Ordonnances
        </ButtonLink>
      </div>
    </Card>
  );
}
