import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_NEXT_APPOINTMENT, DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { appointments } from '@/lib/server/auth';
import type { AppointmentRow } from '@bilanx/records';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { AppointmentForm } from '@/components/appointment-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Rendez-vous' };

const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function Row({ a, past }: { a: AppointmentRow; past?: boolean }) {
  const days = Math.ceil((a.startsAt.getTime() - Date.now()) / 86_400_000);
  return (
    <li>
      <Link href={`/rendez-vous/${a.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-surface-2">
        <span className="min-w-0">
          <span className="block font-medium">{[a.specialty, a.practitioner].filter(Boolean).join(' — ')}</span>
          <span className="block text-sm first-letter:uppercase text-ink-2">{fmt.format(a.startsAt)}</span>
          {a.location && <span className="block truncate text-xs text-ink-3">{a.location}</span>}
        </span>
        {past ? (
          a.notesAfter ? <Chip tone="sage">notes</Chip> : <Chip tone="neutral">sans notes</Chip>
        ) : (
          <Chip tone={days <= 2 ? 'amber' : 'petrol'}>{days <= 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} j`}</Chip>
        )}
      </Link>
    </li>
  );
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'appointments')) return <ModuleForbidden title="Rendez-vous" profileName={name} />;
  const sp = await searchParams;
  const now = new Date();
  if (ctx.active.kind === 'demo') {
    const at = new Date(now.getTime() + DEMO_NEXT_APPOINTMENT.inDays * 86_400_000);
    return (
      <div className="fade-in">
        <PageHeader title="Rendez-vous" subtitle="Profil : Claire (démonstration, données fictives)" />
        <Card className="max-w-2xl">
          <p className="font-medium">{DEMO_NEXT_APPOINTMENT.specialty}</p>
          <p className="text-sm text-ink-2">
            Dans {DEMO_NEXT_APPOINTMENT.inDays} jours ({new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'long' }).format(at)}) à {DEMO_NEXT_APPOINTMENT.time}
          </p>
          <Meta>À préparer : {DEMO_NEXT_APPOINTMENT.toPrepare}. Le profil de démonstration est en lecture seule.</Meta>
        </Card>
      </div>
    );
  }
  const canWrite = moduleAllowed(ctx.active, 'appointments', 'write');
  const { upcoming, past } = await appointments().list(ctx.user, ctx.active.access.profileId);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(now);

  return (
    <div className="fade-in">
      <PageHeader title="Rendez-vous" subtitle={`Profil : ${name}`} />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Rendez-vous supprimé.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <h2 className="font-semibold">À venir</h2>
            {upcoming.length ? <ul className="mt-1 divide-y divide-line">{upcoming.map((a) => <Row key={a.id} a={a} />)}</ul> : <p className="mt-2 text-sm text-ink-3">Aucun rendez-vous à venir.</p>}
          </Card>
          <Card>
            <h2 className="font-semibold">Passés</h2>
            {past.length ? <ul className="mt-1 divide-y divide-line">{past.map((a) => <Row key={a.id} a={a} past />)}</ul> : <p className="mt-2 text-sm text-ink-3">Aucun rendez-vous passé enregistré.</p>}
          </Card>
        </div>
        {canWrite && (
          <Card>
            <h2 className="mb-3 font-semibold">Nouveau rendez-vous</h2>
            <AppointmentForm initial={{ date: today, time: '09:00' }} showNotes={false} />
          </Card>
        )}
      </div>
    </div>
  );
}
