import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_NEXT_APPOINTMENT, DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { appointments } from '@/lib/server/auth';
import type { AppointmentRow } from '@bilanx/records';
import { Card, CardHeader, Chip, Meta, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { appointmentWhen } from '@/components/rendez-vous-when';
import { AppointmentForm } from '@/components/appointment-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Rendez-vous' };



function Row({ a, past }: { a: AppointmentRow; past?: boolean }) {
  const days = Math.ceil((a.startsAt.getTime() - Date.now()) / 86_400_000);
  return (
    <li>
      <Link href={`/rendez-vous/${a.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-surface-2">
        <span className="min-w-0">
          <span className="block font-medium">{[a.specialty, a.practitioner].filter(Boolean).join(' — ')}</span>
          <span className="block text-sm text-ink-2 first-letter:uppercase">{appointmentWhen(a.startsAt)}</span>
          {a.location && <span className="block truncate text-[13px] text-ink-3">{a.location}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {past ? (
            a.notesAfter ? <Chip tone="sage">notes</Chip> : <Chip tone="neutral">sans notes</Chip>
          ) : (
            <Chip tone={days <= 2 ? 'amber' : 'petrol'}>{days <= 0 ? 'aujourd’hui' : days === 1 ? 'demain' : `dans ${days} jours`}</Chip>
          )}
          <Icon name="chevronRight" className="size-5 text-ink-3" />
        </span>
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
        <PageHeader title="Rendez-vous" />
        <Card className="max-w-2xl">
          <CardHeader title="À venir" />
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
      <PageHeader title="Rendez-vous" />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Rendez-vous supprimé.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-[auto_1fr]">
        <Card className="xl:col-start-1 xl:row-start-1">
          <CardHeader title="À venir" />
          {upcoming.length ? <ul className="divide-y divide-line">{upcoming.map((a) => <Row key={a.id} a={a} />)}</ul> : <p className="text-sm text-ink-2">Aucun rendez-vous à venir.</p>}
        </Card>
        {canWrite && (
          <div className="min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1">
            <Card id="nouveau-rendez-vous" className="scroll-mt-20">
              <CardHeader title="Nouveau rendez-vous" />
              <AppointmentForm initial={{ date: today, time: '09:00' }} showNotes={false} />
            </Card>
          </div>
        )}
        {past.length > 0 && (
          <Card className="xl:col-start-1 xl:row-start-2 xl:self-start">
            <CardHeader title="Passés" />
            <ul className="divide-y divide-line">{past.map((a) => <Row key={a.id} a={a} past />)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
