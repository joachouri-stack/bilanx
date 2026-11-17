import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_NEXT_APPOINTMENT, DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { appointments, carePlans, contacts } from '@/lib/server/auth';
import type { AppointmentRow, CarePlanRow, ContactRow } from '@bilanx/records';
import { CARE_PLAN_PRESETS, carePlanFrequency } from '@bilanx/domain';
import { addCarePlanPresetsAction, deleteCarePlanAction, setCarePlanLastDoneAction } from '@/lib/server/actions';
import { CarePlanForm } from '@/components/care-plan-form';
import { DocIcon } from '@/components/documents-icons';
import type { DocCategoryIcon } from '@/lib/document-categories';
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

// ───────────────────────── Suivis réguliers ─────────────────────────
const dayFr = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat('fr-FR', { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)).replace('.', '');
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Contact du carnet qui correspond au suivi (spécialité ou nom du suivi). */
function contactFor(p: CarePlanRow, list: ContactRow[]): ContactRow | null {
  const keys = [p.specialty, p.label].filter(Boolean).map((k) => fold(k!).slice(0, 6));
  return list.find((c) => c.specialty && keys.some((k) => fold(c.specialty!).includes(k) || k.includes(fold(c.specialty!).slice(0, 6)))) ?? null;
}

const PLAN_TONE: Record<string, string> = {
  drop: 'bg-glucose-2 text-glucose',
  flask: 'bg-glucose-2 text-glucose',
  foot: 'bg-sage-2 text-sage',
  vessel: 'bg-red-2 text-red',
  tooth: 'bg-indigo-2 text-indigo',
  eye: 'bg-indigo-2 text-indigo',
  heart: 'bg-rose-2 text-rose',
  brain: 'bg-violet-2 text-violet',
  ear: 'bg-amber-2 text-amber',
  kidney: 'bg-petrol-2 text-petrol',
};
const planTone = (icon: string) => PLAN_TONE[icon] ?? 'bg-violet-2 text-violet';

function PlanIcon({ p, size = 'size-11' }: { p: { icon: string }; size?: string }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-2xl ${planTone(p.icon)}`} aria-hidden>
      <DocIcon name={p.icon as DocCategoryIcon} className="size-[22px]" />
    </span>
  );
}

/** État en mots : « En retard de 5 jours », « À prendre avant le 5 déc. », « RDV pris le 2 févr. »… */
function planStatus(p: CarePlanRow): { text: string; short: string; sub: string; tone: string; bar: string } {
  const d = p.daysToDue ?? 0;
  if (p.status === 'booked' && p.nextAppointment) {
    const on = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: DEMO_TIMEZONE }).format(p.nextAppointment.startsAt).replace('.', '');
    return { text: `RDV pris le ${on}`, short: on, sub: 'RDV pris', tone: 'text-go', bar: 'bg-go' };
  }
  if (p.status === 'late') return { text: `En retard de ${-d} jour${-d > 1 ? 's' : ''}`, short: `+${-d} j`, sub: 'en retard', tone: 'text-red', bar: 'bg-red' };
  if (p.status === 'soon') return { text: `À prendre avant le ${dayFr(p.due!)}`, short: `${d} j`, sub: `avant le ${dayFr(p.due!)}`, tone: 'text-amber', bar: 'bg-amber' };
  if (p.status === 'unknown') return { text: 'Dernier passage à indiquer', short: '?', sub: 'à compléter', tone: 'text-ink-2', bar: 'bg-ink-3' };
  const months = Math.round(d / 30);
  return {
    text: `Prochain vers ${dayFr(p.due!, { month: 'long', year: 'numeric' })}`,
    short: dayFr(p.due!, { month: 'short' }).replace(/^./, (c) => c.toUpperCase()),
    sub: months >= 1 ? `dans ~${months} mois` : `dans ${d} jours`,
    tone: 'text-ink',
    bar: 'bg-ink-3',
  };
}

/** Anneau du résumé : un arc par état (à jour, à prendre, en retard, à compléter). */
function SummaryRing({ plans }: { plans: CarePlanRow[] }) {
  const n = plans.length;
  const upToDate = plans.filter((p) => p.status === 'ok' || p.status === 'booked').length;
  const parts = [
    { n: upToDate, color: 'var(--go)', label: 'à jour' },
    { n: plans.filter((p) => p.status === 'soon').length, color: 'var(--amber)', label: 'à prendre bientôt' },
    { n: plans.filter((p) => p.status === 'late').length, color: 'var(--red)', label: 'en retard' },
    { n: plans.filter((p) => p.status === 'unknown').length, color: 'var(--ink-3)', label: 'à compléter' },
  ];
  const C = 2 * Math.PI * 40;
  const gap = n > 1 ? 6 : 0;
  let offset = 0;
  return (
    <section aria-label="Mes suivis réguliers" className={`${card} flex items-center gap-4 p-4`}>
      <svg width="96" height="96" viewBox="0 0 100 100" className="shrink-0" aria-hidden>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        {parts.map((pt) => {
          if (!pt.n) return null;
          const len = (pt.n / n) * C;
          const el = (
            <circle
              key={pt.label}
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={pt.color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0.1, len - gap)} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="50" y="50" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--ink)">
          {upToDate}/{n}
        </text>
        <text x="50" y="66" textAnchor="middle" fontSize="10.5" fill="var(--ink-3)">
          à jour
        </text>
      </svg>
      <div className="grid gap-1.5 text-[15px]">
        <p className="font-semibold">Mes suivis réguliers</p>
        {parts
          .filter((pt) => pt.n)
          .map((pt) => (
            <p key={pt.label} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: pt.color }} aria-hidden />
              <strong className="tabular">{pt.n}</strong> {pt.label}
            </p>
          ))}
      </div>
    </section>
  );
}

/** Carte « à faire » : suivi à prendre ou en retard, contact du carnet, Appeler / En ligne / RDV pris. */
function TodoCard({ p, contact }: { p: CarePlanRow; contact: ContactRow | null }) {
  const st = planStatus(p);
  const late = p.status === 'late';
  const name = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : null;
  return (
    <li className={`${card} p-4`}>
      <div aria-hidden className={`pointer-events-none absolute -right-10 -top-12 size-36 rounded-full blur-2xl ${late ? 'bg-red/25' : 'bg-amber/25'}`} />
      <div className="relative flex items-start gap-3">
        <PlanIcon p={p} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold leading-tight">{p.label}</h3>
          <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${late ? 'bg-red-2 text-red' : 'bg-amber-2 text-amber'}`}>{st.text}</span>
          <p className="mt-1 text-[13px] text-ink-3">
            {carePlanFrequency(p)}
            {p.lastDone ? ` · dernier passage le ${dayFr(p.lastDone, { day: 'numeric', month: 'long' })}` : ''}
          </p>
        </div>
      </div>
      {name && (
        <p className="relative mt-3 flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <Icon name="user" className="size-4 shrink-0 text-ink-3" />
          <span className="min-w-0 flex-1 truncate">
            <strong className="font-semibold">{name}</strong>
            {contact!.specialty ? ` · ${contact!.specialty}` : ''}
          </span>
        </p>
      )}
      <div className="relative mt-3 grid grid-cols-[1fr_1fr_1.25fr] gap-2">
        {contact?.phone ? (
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className={buttonClass({ variant: 'secondary', className: '!px-2' })}>
            <Icon name="phone" className="size-4" />
            Appeler
          </a>
        ) : (
          <Link href="/contacts" className={buttonClass({ variant: 'secondary', className: '!px-2' })}>
            <Icon name="user" className="size-4" />
            Contact
          </Link>
        )}
        <a href="https://www.doctolib.fr/" target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'secondary', className: '!px-2' })}>
          <Icon name="globe" className="size-4" />
          En ligne
        </a>
        <Link href={`/rendez-vous?suivi=${p.id}#nouveau-rendez-vous`} className={buttonClass({ variant: 'primary', className: '!px-2' })}>
          <Icon name="check" className="size-4" />
          RDV pris
        </Link>
      </div>
    </li>
  );
}

/** Frise des 12 prochains mois : RDV pris, suivis à prendre, passages prévus (avec la date du rappel). */
function Timeline({ upcoming, plans, today }: { upcoming: AppointmentRow[]; plans: CarePlanRow[]; today: string }) {
  type Ev = { key: string; month: string; day: string; label: string; icon: string; kind: 'taken' | 'late' | 'soon' | 'planned'; note: string; href?: string };
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(d);
  const limit = `${Number(today.slice(0, 4)) + 1}-${today.slice(5, 7)}-01`;
  const events: Ev[] = [];
  for (const a of upcoming) {
    const d = ymd(a.startsAt);
    if (d >= limit) continue;
    const plan = plans.find((p) => p.id === a.carePlanId);
    events.push({ key: a.id, month: d.slice(0, 7), day: String(Number(d.slice(8))), label: plan?.label ?? title(a), icon: plan?.icon ?? 'calendar', kind: 'taken', note: 'pris', href: `/rendez-vous/${a.id}` });
  }
  for (const p of plans) {
    if (p.status === 'booked' || !p.due || p.status === 'unknown') continue;
    if (p.status === 'late') {
      events.push({ key: p.id, month: today.slice(0, 7), day: '!', label: p.label, icon: p.icon, kind: 'late', note: 'à prendre' });
      continue;
    }
    if (p.due >= limit) continue;
    if (p.status === 'soon') events.push({ key: p.id, month: p.due.slice(0, 7), day: String(Number(p.due.slice(8))), label: p.label, icon: p.icon, kind: 'soon', note: 'à prendre' });
    else events.push({ key: p.id, month: p.due.slice(0, 7), day: '~', label: p.label, icon: p.icon, kind: 'planned', note: `rappel ${dayFr(p.remindOn!)}` });
  }
  if (!events.length) return null;
  const months = [...new Set(events.map((e) => e.month))].sort();
  const order = { late: 0, soon: 1, taken: 2, planned: 3 };
  const evClass = {
    taken: 'bg-surface-2',
    late: 'bg-red-2 text-red',
    soon: 'bg-amber-2 text-amber',
    planned: 'border border-dashed border-line',
  };
  return (
    <section aria-labelledby="mois-a-venir">
      <h2 id="mois-a-venir" className="mb-2.5 px-1 text-[15px] font-semibold">
        Les mois à venir
      </h2>
      <div className={`${card} p-4`}>
        <ol className="relative flex flex-col gap-4 pl-6 before:absolute before:bottom-1.5 before:left-[7px] before:top-1.5 before:w-0.5 before:rounded before:bg-line">
          {months.map((m) => {
            const now = m === today.slice(0, 7);
            const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: m.slice(0, 4) !== today.slice(0, 4) ? 'numeric' : undefined, timeZone: 'UTC' }).format(new Date(`${m}-15T12:00:00Z`));
            return (
              <li key={m} className="relative">
                <span aria-hidden className={`absolute -left-6 top-0.5 size-3.5 rounded-full border-2 ${now ? 'border-petrol bg-petrol' : 'border-ink-3 bg-surface'}`} />
                <h3 className={`mb-2 text-[12px] font-bold uppercase tracking-wider ${now ? 'text-petrol' : 'text-ink-3'}`}>{label}</h3>
                <ul className="flex flex-col gap-1.5">
                  {events
                    .filter((e) => e.month === m)
                    .sort((a, b) => order[a.kind] - order[b.kind])
                    .map((e) => {
                      const body = (
                        <>
                          <span className="tabular w-6 shrink-0 text-center font-bold">{e.day}</span>
                          <DocIcon name={e.icon as DocCategoryIcon} className="size-[18px] shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{e.label}</span>
                          <span className={`shrink-0 text-[12px] font-semibold ${e.kind === 'taken' ? 'text-go' : e.kind === 'planned' ? 'text-ink-3' : ''}`}>
                            {e.kind === 'planned' && <Icon name="bell" className="mr-0.5 inline size-3.5 align-[-2px]" />}
                            {e.note}
                          </span>
                        </>
                      );
                      const cls = `flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[15px] ${evClass[e.kind]}`;
                      return <li key={e.key}>{e.href ? <Link href={e.href} className={cls}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
                    })}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Liste des suivis : barre de progression depuis le dernier passage (trait = jour du rappel), modification. */
function PlansList({ plans, today, canWrite }: { plans: CarePlanRow[]; today: string; canWrite: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {plans.map((p) => {
        const st = planStatus(p);
        return (
          <li key={p.id} className="py-3 first:pt-0 last:pb-0">
            <details className="group">
              <summary className="flex cursor-pointer list-none flex-col gap-2 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-3">
                  <PlanIcon p={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-tight">{p.label}</span>
                    <span className="block text-[13px] text-ink-3">{carePlanFrequency(p)}</span>
                  </span>
                  <span className={`shrink-0 text-right font-bold tabular ${st.tone}`}>
                    {st.short}
                    <span className="block text-[12px] font-medium text-ink-3">{st.sub}</span>
                  </span>
                </span>
                {p.progress !== null && (
                  <span className="relative ml-14 block h-2 rounded-full bg-surface-2" aria-hidden>
                    <span className={`absolute inset-y-0 left-0 rounded-full ${st.bar}`} style={{ width: `${Math.max(4, p.progress * 100)}%` }} />
                    {p.remindAt !== null && <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink-3" style={{ left: `${p.remindAt * 100}%` }} />}
                  </span>
                )}
              </summary>
              <div className="mt-3 rounded-2xl border border-line p-3">
                {p.status === 'unknown' && canWrite && (
                  <form action={setCarePlanLastDoneAction} className="mb-3 flex items-end gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
                      Date du dernier passage
                      <input type="date" name="lastDone" max={today} required className="min-h-11 w-full rounded-xl border border-line bg-surface px-3" />
                    </label>
                    <button type="submit" className={buttonClass({ variant: 'primary' })}>
                      OK
                    </button>
                  </form>
                )}
                <p className="mb-3 text-sm text-ink-2">
                  {p.lastDone
                    ? `Dernier passage : ${dayFr(p.lastDone, { day: 'numeric', month: 'long', year: 'numeric' })}${p.lastDoneSource === 'lab' ? ' (dernière analyse)' : p.lastDoneSource === 'appointment' ? ' (rendez-vous)' : ''}.`
                    : 'Dernier passage inconnu.'}
                  {p.due ? ` Échéance : ${dayFr(p.due, { day: 'numeric', month: 'long', year: 'numeric' })}, rappel le ${dayFr(p.remindOn!, { day: 'numeric', month: 'long' })}.` : ''}
                </p>
                {canWrite && (
                  <>
                    <CarePlanForm
                      today={today}
                      initial={{
                        id: p.id,
                        label: p.label,
                        icon: p.icon,
                        specialty: p.specialty ?? '',
                        everyMonths: p.everyMonths,
                        fixedMonth: p.fixedMonth,
                        remindDays: p.remindDays,
                        lastDone: p.lastDoneManual,
                        labAnalyte: p.labAnalyte,
                      }}
                    />
                    <form action={deleteCarePlanAction} className="mt-2">
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className={buttonClass({ variant: 'ghost', className: 'w-full text-red' })}>
                        Supprimer ce suivi
                      </button>
                    </form>
                  </>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/** Démarrage : suivis proposés, à cocher, avec la date du dernier passage si connue. */
function Starter({ today }: { today: string }) {
  return (
    <form action={addCarePlanPresetsAction} className="flex flex-col gap-2">
      <p className="text-sm text-ink-2">Cochez vos suivis. Les fréquences se modifient ensuite. Indiquez le dernier passage si vous le connaissez.</p>
      <ul className="flex flex-col gap-2">
        {CARE_PLAN_PRESETS.map((p) => (
          <li key={p.key} className="rounded-2xl border border-line p-3">
            <label className="flex items-center gap-3">
              <input type="checkbox" name="preset" value={p.key} defaultChecked={p.suggested} className="size-5 accent-[var(--petrol)]" />
              <PlanIcon p={{ icon: p.icon ?? 'calendar' }} size="size-10" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-tight">{p.label}</span>
                <span className="block text-[13px] text-ink-3">{carePlanFrequency({ everyMonths: p.everyMonths ?? null, fixedMonth: p.fixedMonth ?? null })}</span>
              </span>
            </label>
            {!p.labAnalyte && (
              <label className="mt-2 flex items-center gap-2 pl-8 text-[13px] text-ink-2">
                Dernier passage
                <input type="date" name={`last-${p.key}`} max={today} className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-[15px]" />
              </label>
            )}
            {p.labAnalyte && <p className="mt-1 pl-8 text-[13px] text-ink-3">Date reprise de votre dernière HbA1c enregistrée.</p>}
          </li>
        ))}
      </ul>
      <button type="submit" className={buttonClass({ variant: 'primary', className: 'mt-1 w-full' })}>
        Ajouter ces suivis
      </button>
    </form>
  );
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ supprime?: string; suivi?: string; suivi_ok?: string }> }) {
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
  const pid = ctx.active.access.profileId;
  const [{ upcoming, past }, plans, book] = await Promise.all([
    appointments().list(ctx.user, pid),
    carePlans().list(ctx.user, pid),
    contacts()
      .list(ctx.user, pid)
      .catch(() => [] as ContactRow[]),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(now);
  const [next, ...later] = upcoming;
  // « À faire » : en retard d'abord, puis à prendre (échéance la plus proche d'abord).
  const todo = plans.filter((p) => p.status === 'late' || p.status === 'soon').sort((a, b) => (a.daysToDue ?? 0) - (b.daysToDue ?? 0));
  // « RDV pris » depuis une carte : formulaire présélectionné sur ce suivi.
  const fromPlan = plans.find((p) => p.id === sp.suivi) ?? null;

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
          {sp.suivi_ok && (
            <p role="status" className="rounded-xl bg-sage-2 px-4 py-3 text-sm">
              {sp.suivi_ok === 'supprime' ? 'Suivi supprimé.' : sp.suivi_ok === 'modifie' ? 'Suivi enregistré.' : 'Suivi ajouté.'}
            </p>
          )}
          {plans.length > 0 && <SummaryRing plans={plans} />}

          {todo.length > 0 && (
            <section aria-labelledby="a-faire">
              <h2 id="a-faire" className="mb-2.5 flex items-center gap-2 px-1 text-[15px] font-semibold">
                À faire
                <span className="rounded-full bg-red px-2 text-[12px] font-bold text-on-accent">{todo.length}</span>
              </h2>
              <ul className="flex flex-col gap-2.5">
                {todo.map((p) => (
                  <TodoCard key={p.id} p={p} contact={contactFor(p, book)} />
                ))}
              </ul>
            </section>
          )}

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

          <Timeline upcoming={upcoming} plans={plans} today={today} />

          <section aria-labelledby="mes-suivis-titre" id="mes-suivis" className="scroll-mt-20">
            <h2 id="mes-suivis-titre" className="mb-2.5 px-1 text-[15px] font-semibold">
              Mes suivis
            </h2>
            <div className={`${card} p-4`}>
              {plans.length ? (
                <>
                  <PlansList plans={plans} today={today} canWrite={canWrite} />
                  {canWrite && (
                    <details className="group mt-3">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-line font-semibold text-petrol [&::-webkit-details-marker]:hidden">
                        <Icon name="plus" className="size-5" />
                        Ajouter un suivi
                      </summary>
                      <div className="mt-3">
                        <CarePlanForm today={today} />
                      </div>
                    </details>
                  )}
                  <p className="mt-3 text-center text-[12px] text-ink-3">Barre : temps écoulé depuis le dernier passage · trait : jour du rappel</p>
                </>
              ) : canWrite ? (
                <Starter today={today} />
              ) : (
                <p className="text-ink-2">Aucun suivi régulier.</p>
              )}
            </div>
          </section>

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
            initialOpen={!next || !!fromPlan}
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
              {fromPlan && (
                <p className="mb-3 rounded-xl bg-violet-2 px-3 py-2 text-sm text-violet">
                  Rendez-vous pour le suivi <strong>{fromPlan.label}</strong> : indiquez sa date et son heure.
                </p>
              )}
              <AppointmentForm
                key={fromPlan?.id ?? 'nouveau'}
                initial={{ date: today, time: '09:00', carePlanId: fromPlan?.id ?? '', specialty: fromPlan?.specialty ?? '' }}
                showNotes={false}
                plans={plans.map((p) => ({ id: p.id, label: p.label }))}
              />
            </div>
          </Disclosure>
        )}
      </div>
    </div>
  );
}
