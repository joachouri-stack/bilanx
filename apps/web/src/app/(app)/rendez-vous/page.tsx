import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_NEXT_APPOINTMENT, DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { appointments } from '@/lib/server/auth';
import type { AppointmentRow } from '@bilanx/records';
import { Meta, PageHeader, buttonClass } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Disclosure } from '@/components/disclosure';
import { ProgressRing } from '@/components/progress-ring';
import { appointmentWhen } from '@/components/rendez-vous-when';
import { AppointmentForm } from '@/components/appointment-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Rendez-vous' };

const card = 'relative overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]';
const panelSummary = 'flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden';

/** Jours calendaires (heure de Paris) entre aujourd'hui et la date du rendez-vous. */
function daysUntil(at: Date, now: Date): number {
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(d);
  return Math.round((Date.parse(`${ymd(at)}T12:00:00Z`) - Date.parse(`${ymd(now)}T12:00:00Z`)) / 86_400_000);
}
const relative = (d: number) => (d <= 0 ? 'aujourd’hui' : d === 1 ? 'demain' : `dans ${d} jours`);
const title = (a: { specialty: string | null; practitioner: string | null }) => [a.specialty, a.practitioner].filter(Boolean).join(' — ') || 'Rendez-vous';

/** Pastille date : jour en grand, mois en dessous. */
function DateTile({ at, tone }: { at: Date; tone: 'violet' | 'neutral' }) {
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, day: 'numeric' }).format(at);
  const month = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, month: 'short' }).format(at).replace('.', '');
  return (
    <span aria-hidden className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl ${tone === 'violet' ? 'bg-violet-2 text-violet' : 'bg-surface-2 text-ink-2'}`}>
      <span className="tabular text-xl font-bold leading-none">{day}</span>
      <span className="mt-0.5 text-[12px] font-medium uppercase leading-none">{month}</span>
    </span>
  );
}

function Row({ a, now, past }: { a: AppointmentRow; now: Date; past?: boolean }) {
  const d = daysUntil(a.startsAt, now);
  return (
    <li>
      <Link href={`/rendez-vous/${a.id}`} className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-surface-2 active:scale-[0.99]">
        <DateTile at={a.startsAt} tone={past ? 'neutral' : 'violet'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold first-letter:uppercase">{title(a)}</span>
          <span className="block truncate text-sm text-ink-2 first-letter:uppercase">{appointmentWhen(a.startsAt)}</span>
        </span>
        {past ? (
          a.notesAfter ? (
            <span className="shrink-0 rounded-full bg-sage-2 px-2.5 py-0.5 text-[12px] font-semibold text-go">notes</span>
          ) : null
        ) : (
          <span className="shrink-0 rounded-full bg-violet-2 px-2.5 py-0.5 text-[12px] font-semibold text-violet">{relative(d)}</span>
        )}
        <Icon name="chevronRight" className="size-5 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

/** Carte du prochain rendez-vous : compte à rebours en anneau, détails, accès rapide à l'agenda. */
function NextCard({
  a,
  now,
  readOnly,
}: {
  a: { id?: string; startsAt: Date; specialty: string | null; practitioner: string | null; location: string | null; reason: string | null; toPrepare: string | null };
  now: Date;
  readOnly?: boolean;
}) {
  const d = daysUntil(a.startsAt, now);
  const time = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(a.startsAt).replace(':', ' h ');
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long' }).format(a.startsAt);
  return (
    <section aria-label="Prochain rendez-vous" className={`${card} p-5 sm:p-6`}>
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[radial-gradient(closest-side,rgba(167,139,250,0.25),transparent)]" />
      <p className="relative text-sm font-semibold text-violet">Prochain rendez-vous</p>
      <div className="relative mt-3 flex items-center gap-5">
        {/* L'anneau se remplit à l'approche (sur 30 jours). */}
        <ProgressRing value={1 - Math.min(30, Math.max(0, d)) / 30} size={112} stroke={11} colors={['#c4b5fd', '#7c3aed']}>
          <div>
            <p className="tabular text-[28px] font-bold leading-none">{d <= 0 ? 'Auj.' : d === 1 ? 'Dem.' : d}</p>
            {d > 1 && <p className="mt-0.5 text-[12px] text-ink-3">jours</p>}
          </div>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight first-letter:uppercase">{a.specialty || a.practitioner || 'Rendez-vous'}</h2>
          {a.specialty && a.practitioner && <p className="text-ink-2">{a.practitioner}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-[15px] first-letter:uppercase">
            <Icon name="calendar" className="size-4 shrink-0 text-violet" />
            <span className="first-letter:uppercase">{date}</span>
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[15px]">
            <Icon name="clock" className="size-4 shrink-0 text-violet" />
            {time}
          </p>
          {a.location && (
            <p className="mt-1 flex items-center gap-1.5 truncate text-[15px] text-ink-2">
              <Icon name="pin" className="size-4 shrink-0 text-violet" />
              <span className="truncate">{a.location}</span>
            </p>
          )}
        </div>
      </div>
      {(a.reason || a.toPrepare) && (
        <ul className="relative mt-4 divide-y divide-line">
          {a.reason && (
            <li className="flex items-start gap-3 py-2.5">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-violet" aria-hidden />
              <span className="w-24 shrink-0 text-[15px] text-ink-2">Motif</span>
              <span className="min-w-0 flex-1 text-[15px] font-medium">{a.reason}</span>
            </li>
          )}
          {a.toPrepare && (
            <li className="flex items-start gap-3 py-2.5">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-amber" aria-hidden />
              <span className="w-24 shrink-0 text-[15px] text-ink-2">À préparer</span>
              <span className="min-w-0 flex-1 text-[15px] font-medium">{a.toPrepare}</span>
            </li>
          )}
        </ul>
      )}
      {!readOnly && a.id && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          <a href={`/api/rendez-vous/${a.id}/ics`} className={buttonClass({ variant: 'secondary' })}>
            <Icon name="calendar" className="size-5" />
            Ajouter à mon agenda
          </a>
          <Link href={`/rendez-vous/${a.id}`} className={buttonClass({ variant: 'ghost' })}>
            Détails <span aria-hidden>›</span>
          </Link>
        </div>
      )}
    </section>
  );
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'appointments')) return <ModuleForbidden title="Rendez-vous" profileName={name} />;
  const sp = await searchParams;
  const now = new Date();
  if (ctx.active.kind === 'demo') {
    const [h = '09', m = '00'] = DEMO_NEXT_APPOINTMENT.time.split(':');
    const at = new Date(now.getTime() + DEMO_NEXT_APPOINTMENT.inDays * 86_400_000);
    at.setUTCHours(Number(h) - 1, Number(m), 0, 0);
    return (
      <div className="fade-in">
        <PageHeader title="Rendez-vous" />
        <div className="max-w-2xl">
          <NextCard
            a={{ startsAt: at, specialty: DEMO_NEXT_APPOINTMENT.specialty, practitioner: null, location: null, reason: null, toPrepare: DEMO_NEXT_APPOINTMENT.toPrepare }}
            now={now}
            readOnly
          />
          <Meta className="mt-2">Le profil de démonstration est en lecture seule.</Meta>
        </div>
      </div>
    );
  }
  const canWrite = moduleAllowed(ctx.active, 'appointments', 'write');
  const { upcoming, past } = await appointments().list(ctx.user, ctx.active.access.profileId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(now);
  const [next, ...later] = upcoming;

  return (
    <div className="fade-in">
      <PageHeader title="Rendez-vous" />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Rendez-vous supprimé.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {next ? (
            <NextCard a={next} now={now} />
          ) : (
            <section className={`${card} p-5 text-center`}>
              <p className="font-semibold">Aucun rendez-vous à venir</p>
              {canWrite && <p className="mt-1 text-sm text-ink-2">Ajoutez-le ci-dessous : BILANX vous le rappellera.</p>}
            </section>
          )}

          {later.length > 0 && (
            <section className={`${card} p-4 sm:p-5`}>
              <h2 className="mb-1 font-semibold">Ensuite</h2>
              <ul>{later.map((a) => <Row key={a.id} a={a} now={now} />)}</ul>
            </section>
          )}

          {past.length > 0 && (
            <details className={`group ${card}`}>
              <summary className={panelSummary}>
                <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
                  <Icon name="journal" className="size-5" />
                </span>
                <h2 className="flex-1 font-semibold">Rendez-vous passés</h2>
                <span className="text-sm text-ink-3">{past.length}</span>
                <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="border-t border-line px-4 pb-2 pt-1">{past.map((a) => <Row key={a.id} a={a} now={now} past />)}</ul>
            </details>
          )}
        </div>

        {canWrite && (
          <Disclosure
            id="nouveau-rendez-vous"
            className={`group scroll-mt-20 ${card}`}
            initialOpen={!next}
            summary={
              <summary className={panelSummary}>
                <span className="grid size-9 place-items-center rounded-full bg-violet-2 text-violet" aria-hidden>
                  <Icon name="plus" className="size-5" />
                </span>
                <h2 className="flex-1 font-semibold">Nouveau rendez-vous</h2>
                <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
              </summary>
            }
          >
            <div className="border-t border-line px-4 pb-4 pt-4">
              <AppointmentForm initial={{ date: today, time: '09:00' }} showNotes={false} />
            </div>
          </Disclosure>
        )}
      </div>
    </div>
  );
}
