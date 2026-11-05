import type { Metadata } from 'next';
import Link from 'next/link';
import {
  addDays,
  computeGlucoseStats,
  dayBounds,
  formatLocalDate,
  formatNumberFr,
  getAnalyte,
  formatGlucose,
  formatHba1c,
  latestEvolution,
  referenceStatus,
  summarizeInsulin,
} from '@bilanx/domain';
import {
  DEMO_LAST_IMPORT_MINUTES_AGO,
  DEMO_NEXT_APPOINTMENT,
  DEMO_PROFILE,
  DEMO_TIMEZONE,
  demoToday,
} from '@/lib/demo-data';
import { appContext, displayUnits, moduleAllowed } from '@/lib/server/context';
import { glucoseDay, labResults, sensorRange, type LabRow } from '@/lib/server/data';
import { insulinDoses, toDomainDoses } from '@/lib/server/insulin-data';
import { appointments, documents } from '@/lib/server/auth';
import { QUICK_ADD } from '@/lib/navigation';
import { DOC_CATEGORIES, documentTitle } from '@/lib/document-categories';
import { stepsDaily, stepsGoal, stepsSource } from '@/lib/server/activity-data';
import { medicationDay, medicationList } from '@/lib/server/medication-data';
import { ButtonLink, Card, CardLabel, Meta, PageHeader, RangeBar, pct } from '@/components/ui';
import { CapsuleGauge } from '@/components/capsule-gauge';

export const metadata: Metadata = { title: 'Tableau de bord' };
export const dynamic = 'force-dynamic';


export default async function DashboardPage() {
  const ctx = await appContext();
  const isDemo = ctx.active.kind === 'demo';
  const UNIT = displayUnits(ctx.active).glucose;
  const A1C = displayUnits(ctx.active).hba1c;
  const showGlucose = moduleAllowed(ctx.active, 'glucose');
  const showLab = moduleAllowed(ctx.active, 'lab');
  const now = new Date();
  const today = demoToday(now);
  const todayData = showGlucose ? await glucoseDay(ctx, today, now) : { sensor: [], capillary: [], events: [], insulin: [] };
  // Dernière glycémie du jour : capteur ou lecteur (saisie), la plus récente.
  const lastSensor = todayData.sensor.at(-1);
  const lastCap = todayData.capillary.at(-1);
  const last = lastSensor && (!lastCap || lastSensor.at >= lastCap.at) ? lastSensor : lastCap;
  const lastIsSensor = !!last && last === lastSensor;
  const showDocs = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'documents');
  const docs = showDocs && ctx.active.kind === 'real' ? await documents().list(ctx.user, ctx.active.access.profileId) : [];
  const canAdd = (base: string) => {
    if (ctx.active.kind !== 'real') return false;
    const m = ({ '/glycemie': 'glucose', '/analyses': 'lab', '/activite': 'activity', '/documents': 'documents' } as const)[base as '/glycemie'];
    return !!m && moduleAllowed(ctx.active, m, 'write');
  };
  const quick = QUICK_ADD.filter((q) => canAdd(q.base));

  const from14 = addDays(today, -13);
  const stats14 = computeGlucoseStats(showGlucose ? await sensorRange(ctx, from14, today, now) : [], {
    periodStart: dayBounds(from14, DEMO_TIMEZONE).start,
    periodEnd: now,
  });

  const labs: LabRow[] = showLab ? await labResults(ctx) : [];
  const hba1c = latestEvolution(labs.filter((r) => r.analyteCode === 'hba1c'));
  const insulinRows = moduleAllowed(ctx.active, 'insulin') ? await insulinDoses(ctx, today, today, now) : [];
  const insulinToday = summarizeInsulin(toDomainDoses(insulinRows), DEMO_TIMEZONE);
  // Carte affichée seulement si le profil utilise ce module (pas de carte insuline pour une personne non concernée).
  const showInsulin = isDemo || insulinRows.length > 0;
  const showActivity = moduleAllowed(ctx.active, 'activity');
  const [stepsToday, goal, stepsSrc] = showActivity
    ? await Promise.all([stepsDaily(ctx, today, today, now), stepsGoal(ctx), stepsSource(ctx)])
    : [new Map<string, number>(), 8000, null];
  const todaySteps = stepsToday.get(formatLocalDate(today)) ?? null;
  const nextAppointment =
    ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'appointments')
      ? ((await appointments().list(ctx.user, ctx.active.access.profileId)).upcoming[0] ?? null)
      : null;
  const showMeds = moduleAllowed(ctx.active, 'medications');
  const [medsNow, medsToday] = showMeds ? await Promise.all([medicationList(ctx), medicationDay(ctx, today, now)]) : [{ current: [], past: [] }, []];
  const nextDose = medsToday.find((d) => d.at.getTime() > now.getTime() - 30 * 60_000 && !d.status) ?? null;
  const profileName = isDemo ? DEMO_PROFILE.displayName : ctx.active.kind === 'real' ? ctx.active.access.displayName : '';
  const isSelf = ctx.active.kind === 'real' && ctx.active.access.relationship === 'self' && ctx.active.access.role === 'owner';

  const latestByAnalyte = new Map<string, LabRow>();
  for (const r of labs) {
    const cur = latestByAnalyte.get(r.analyteCode);
    if (!cur || r.sampledAt > cur.sampledAt) latestByAnalyte.set(r.analyteCode, r);
  }
  const watch = [...latestByAnalyte.values()].filter(
    (r) => r.analyteCode !== 'hba1c' && referenceStatus(r.value, { low: r.refLow, high: r.refHigh }) !== 'within',
  );

  const dateFr = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'full' }).format(now);
  const dateShort = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'short' }).format(d);
  const timeShort = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, timeStyle: 'short' }).format(d);
  const lastInRange = last ? last.mgdl >= 70 && last.mgdl <= 180 : false;

  return (
    <div className="fade-in">
      <PageHeader
        title={isDemo || isSelf ? `Bonjour ${isDemo ? profileName : (ctx.user.displayName ?? '')}` : `Profil de ${profileName}`}
        subtitle={
          <span className="first-letter:uppercase">
            {dateFr} · {isDemo || isSelf ? 'l’essentiel de vos données disponibles.' : 'données de votre proche auxquelles vous avez accès.'}
          </span>
        }
        actions={
          <>
            <ButtonLink href="/parametres">Personnaliser</ButtonLink>
            {showDocs && (
              <ButtonLink href="/documents#ajouter" primary>
                ＋ Ajouter un document
              </ButtonLink>
            )}
          </>
        }
      />

      {quick.length > 0 && (
        <section aria-label="Ajouter rapidement" className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-2 sm:flex-wrap">
            {quick.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium hover:bg-surface-2"
              >
                <span aria-hidden>{q.icon}</span>＋ {q.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      {showDocs && (
        <section aria-label="Mes documents" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DOC_CATEGORIES.filter((c) => c.key !== 'autres').map((c) => {
            const mine = docs.filter((d) => c.kinds.includes(d.kind));
            const latest = mine[0];
            return (
              <Link key={c.key} href={c.key === 'ordonnances' ? '/ordonnances' : `/documents?cat=${c.key}`} className="card flex min-h-24 flex-col justify-between gap-1 p-3.5 transition-transform hover:-translate-y-0.5">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-2xl" aria-hidden>
                    {c.icon}
                  </span>
                  <span className="tabular rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">{mine.length}</span>
                </span>
                <span className="font-semibold">{c.label}</span>
                <span className="truncate text-xs text-ink-3">
                  {latest
                    ? `Dernier : ${documentTitle(latest)}${latest.document_date ? ` · ${new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'short' }).format(new Date(`${latest.document_date}T12:00:00Z`))}` : ''}`
                    : 'Aucun pour l’instant'}
                </span>
              </Link>
            );
          })}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
{showGlucose && (
        <Card href="/glycemie" className="md:col-span-3 xl:col-span-4">
          <CardLabel tone="glucose" tag="Glycémie">
            Dernière mesure du jour
          </CardLabel>
          {last ? (
            <>
              <p className="mt-2.5 flex flex-wrap items-baseline gap-2">
                <span className="tabular text-4xl font-semibold tracking-tight text-glucose">{formatGlucose(last.mgdl, UNIT)}</span>
                <span className="text-sm text-ink-3">{UNIT}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${lastInRange ? 'bg-sage-2 text-sage' : 'bg-amber-2 text-amber'}`}>
                  {lastInRange ? 'dans la cible' : 'hors cible'}
                </span>
              </p>
              {todayData.sensor.length > 1 && <Sparkline points={todayData.sensor.map((s) => s.mgdl)} />}
              <Meta>
                {isDemo
                  ? `Source : import de fichier LibreView (démo) · mesure de ${timeShort(last.at)} · dernier import il y a ${DEMO_LAST_IMPORT_MINUTES_AGO} min`
                  : lastIsSensor
                    ? `Capteur (import de fichier) · mesure de ${timeShort(last.at)}`
                    : `Lecteur, saisie manuelle · ${timeShort(last.at)}${todayData.capillary.length > 1 ? ` · ${todayData.capillary.length} glycémies saisies aujourd’hui` : ''}`}
              </Meta>
            </>
          ) : (
            <Empty>{isDemo ? 'Aucune glycémie importée aujourd’hui.' : 'Aucune glycémie aujourd’hui. Touchez « ＋ Glycémie » pour saisir celle de votre lecteur.'}</Empty>
          )}
        </Card>
        )}

{showGlucose && (
        <Card href="/glycemie?periode=14" className="md:col-span-3 xl:col-span-4">
          <CardLabel tone="glucose" tag="Glycémie">
            14 derniers jours
          </CardLabel>
          {stats14.count === 0 ? (
            <Empty>Aucune mesure du capteur sur les 14 derniers jours.</Empty>
          ) : (
          <>
          <div className="mt-2.5 flex gap-6">
            <Stat label="Moyenne" value={stats14.mean !== null ? formatGlucose(stats14.mean, UNIT) : '—'} unit={UNIT} />
            <Stat label="Dans la cible" value={pct(stats14.pctInRange)} />
            <Stat label="Données" value={pct(stats14.coveragePct)} />
          </div>
          <RangeBar
            veryLow={stats14.pctVeryLow}
            low={stats14.pctLow}
            inRange={stats14.pctInRange}
            high={stats14.pctHigh}
            veryHigh={stats14.pctVeryHigh}
          />
          <Meta>
            Sous la cible {pct(stats14.pctVeryLow + stats14.pctLow)} · au-dessus {pct(stats14.pctHigh + stats14.pctVeryHigh)} · plage
            {' '}{formatGlucose(70, UNIT)}–{formatGlucose(180, UNIT)} {UNIT} (par défaut, à définir avec l’équipe soignante)
          </Meta>
          </>
          )}
        </Card>
        )}

{showLab && (
        <Card href="/analyses/hba1c" className="md:col-span-6 xl:col-span-4">
          <CardLabel tone="petrol" tag="Laboratoire">
            HbA1c
          </CardLabel>
          {hba1c ? (
            <>
              <p className="mt-2.5 flex items-baseline gap-2">
                <span className="tabular text-4xl font-semibold tracking-tight">{formatHba1c(hba1c.latest.value, A1C).value}</span>
                <span className="text-sm text-ink-3">{formatHba1c(hba1c.latest.value, A1C).unit}</span>
                <span className="text-xs text-ink-3">soit {formatHba1c(hba1c.latest.value, A1C).other}</span>
              </p>
              {hba1c.previous && hba1c.delta !== null && (
                <p className="mt-1 text-sm text-ink-2">
                  {hba1c.delta > 0 ? '+' : hba1c.delta < 0 ? '−' : '±'}
                  {formatNumberFr(Math.abs(hba1c.delta), 1)} point par rapport au {dateShort(hba1c.previous.sampledAt)} (
                  {formatNumberFr(hba1c.previous.value, 1)} %)
                </p>
              )}
              <Meta className="mt-2">
                Prélèvement du {dateShort(hba1c.latest.sampledAt)}
                {hba1c.latest.laboratory ? ` · ${hba1c.latest.laboratory}` : ''} · résultat confirmé
              </Meta>
            </>
          ) : (
            <Empty>
              Aucune HbA1c de laboratoire enregistrée.
              {!isDemo && moduleAllowed(ctx.active, 'lab', 'write') && (
                <span className="mt-1 block font-medium text-petrol">Touchez « ＋ HbA1c » pour la saisir.</span>
              )}
            </Empty>
          )}
        </Card>
        )}

        {showActivity && (
        <Card href="/activite" className="md:col-span-3 xl:col-span-3">
          <CardLabel tone="sage" tag="Activité">
            Pas aujourd’hui
          </CardLabel>
          {todaySteps !== null ? (
            <>
              <p className="tabular mt-2.5 text-4xl font-semibold">{formatNumberFr(todaySteps)}</p>
              <div className="my-2 h-2 rounded-full bg-surface-2" role="img" aria-label={`${Math.round((todaySteps / goal) * 100)} % de l’objectif`}>
                <div className="h-full rounded-full bg-sage" style={{ width: `${Math.min(100, (todaySteps / goal) * 100)}%` }} />
              </div>
              <Meta>
                Objectif {formatNumberFr(goal)} · {Math.round((todaySteps / goal) * 100)} %
                <br />
                {isDemo ? 'Données fictives' : stepsSrc?.status === 'manual' ? 'Saisie manuelle' : stepsSrc?.lastImportAt ? `Import Apple Santé du ${new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'short' }).format(stepsSrc.lastImportAt)}` : ''}
              </Meta>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-ink-2">Aucun pas enregistré pour aujourd’hui.</p>
              <Meta className="mt-1">Touchez « ＋ Pas du jour » pour saisir le total de votre téléphone ou de votre montre.</Meta>
            </>
          )}
        </Card>
        )}

{showInsulin && (
        <Card href="/traitements" className="md:col-span-3 xl:col-span-3">
          <CardLabel tone="neutral" tag="💉 Insuline">
            Aujourd’hui
          </CardLabel>
          <p className="mt-2.5 flex items-baseline gap-1">
            <span className="tabular text-4xl font-semibold">{formatNumberFr(insulinToday.total)}</span>
            <span className="text-sm text-ink-3">U</span>
          </p>
          <Meta>
            Lente {formatNumberFr(insulinToday.byType.long)} U · rapide {formatNumberFr(insulinToday.byType.rapid)} U · injections notées comme faites
          </Meta>
        </Card>
        )}

{medsNow.current.length > 0 && (
        <Card href="/medicaments" className="md:col-span-3 xl:col-span-3">
          <CardLabel tone="neutral" tag="💊 Médicaments">
            En cours
          </CardLabel>
          <ul className="mt-2.5 space-y-1 text-sm">
            {medsNow.current.slice(0, 4).map((m) => (
              <li key={m.id}>
                {m.name}
                {m.strength ? ` ${m.strength}` : ''} <span className="text-ink-3">· {m.posology}</span>
              </li>
            ))}
          </ul>
          {medsToday.length > 0 && (
            <Meta>
              Aujourd’hui : {medsToday.filter((d) => d.status === 'taken').length}/{medsToday.length} prise{medsToday.length > 1 ? 's' : ''} notée{medsToday.length > 1 ? 's' : ''}
              {nextDose ? ` · prochaine à ${nextDose.time.replace(':', ' h ')}` : ''}
            </Meta>
          )}
        </Card>
        )}

{nextAppointment && (
        <Card href={`/rendez-vous/${nextAppointment.id}`} className="md:col-span-3 xl:col-span-3">
          <CardLabel tone="neutral" tag="📅 Rendez-vous">
            Prochain
          </CardLabel>
          <p className="mt-2.5 font-semibold">{[nextAppointment.specialty, nextAppointment.practitioner].filter(Boolean).join(' — ')}</p>
          <p className="text-sm first-letter:uppercase">
            {new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(nextAppointment.startsAt)}
          </p>
          {nextAppointment.toPrepare && <Meta>À préparer : {nextAppointment.toPrepare}</Meta>}
        </Card>
        )}
        {isDemo && (
        <Card className="md:col-span-3 xl:col-span-3">
          <CardLabel tone="neutral" tag="📅 Rendez-vous">
            Prochain
          </CardLabel>
          <p className="mt-2.5 font-semibold">{DEMO_NEXT_APPOINTMENT.specialty}</p>
          <p className="text-sm">
            {new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'short', day: 'numeric', month: 'long' }).format(
              new Date(now.getTime() + DEMO_NEXT_APPOINTMENT.inDays * 86_400_000),
            )}{' '}
            · {DEMO_NEXT_APPOINTMENT.time}
          </p>
          <Meta>À préparer : {DEMO_NEXT_APPOINTMENT.toPrepare}</Meta>
        </Card>
        )}

{showLab && labs.length > 0 && (
        <Card className="md:col-span-6 xl:col-span-8">
          <div className="flex items-center justify-between">
            <CardLabel tone="amber" tag="À surveiller">
              Hors de l’intervalle de référence de leur laboratoire
            </CardLabel>
            <Link href="/analyses" className="text-xs text-ink-3 hover:text-ink">
              Tout voir →
            </Link>
          </div>
          {watch.length ? (
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
              {watch.map((r) => {
                const a = getAnalyte(r.analyteCode)!;
                const st = referenceStatus(r.value, { low: r.refLow, high: r.refHigh });
                return (
                  <Link key={r.analyteCode} href={`/analyses/${r.analyteCode}`} className="card flex flex-col items-center gap-1.5 p-3.5 text-center">
                    <CapsuleGauge value={r.value} refLow={r.refLow} refHigh={r.refHigh} label={a.nameFr} />
                    <span className="text-sm font-semibold">{a.nameFr}</span>
                    <span>
                      <strong className="tabular text-lg">{formatNumberFr(r.value)}</strong> <span className="text-xs text-ink-3">{r.unit}</span>
                    </span>
                    <span className="rounded-full bg-amber-2 px-2.5 py-0.5 text-xs font-medium text-amber">
                      {st === 'below' ? 'sous l’intervalle' : 'au-dessus'}
                    </span>
                    <Meta>{dateShort(r.sampledAt)}</Meta>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Empty>Tous vos derniers résultats sont dans l’intervalle de leur laboratoire.</Empty>
          )}
        </Card>
        )}

        {(stats14.count > 0 || labs.length > 0) && (
        <Card className="md:col-span-6 xl:col-span-4">
          <CardLabel tone="neutral" tag="Résumé">
            Données disponibles
          </CardLabel>
          <p className="mt-2.5 text-sm text-ink-2">
            {stats14.mean !== null && (
              <>
                Sur 14 jours, la moyenne du capteur est de <strong>{`${formatGlucose(stats14.mean, UNIT)} ${UNIT}`}</strong> avec{' '}
                {pct(stats14.coveragePct)} de données disponibles.
              </>
            )}
            {hba1c?.previous && hba1c.delta !== null && (
              <>
                {' '}
                Votre dernière HbA1c de laboratoire ({formatNumberFr(hba1c.latest.value, 1)} %) est{' '}
                {hba1c.delta < 0 ? 'inférieure' : hba1c.delta > 0 ? 'supérieure' : 'égale'} à la précédente.
              </>
            )}
            {watch.length > 0 && (
              <>
                {' '}
                {watch.map((w) => getAnalyte(w.analyteCode)!.nameFr).join(', ')} : hors de l’intervalle de leur laboratoire,{' '}
                <strong>à évoquer avec votre médecin</strong>.
              </>
            )}
          </p>
          <Meta className="mt-2">Résumé descriptif généré à partir de vos données, sans interprétation médicale.</Meta>
        </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-xs text-ink-3">{label}</p>
      <p className="tabular text-xl font-semibold">
        {value} {unit && <span className="text-sm font-medium text-ink-3">{unit}</span>}
      </p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-center text-sm text-ink-3">{children}</p>;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const W = 300;
  const H = 46;
  const y = (v: number) => H - 2 - ((Math.min(v, 300) - 40) / 260) * (H - 4);
  const d = points.map((v, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="my-2 h-[46px] w-full" aria-hidden>
      <rect x={0} y={y(180)} width={W} height={y(70) - y(180)} fill="var(--sage-2)" />
      <path d={d} fill="none" stroke="var(--glucose)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
