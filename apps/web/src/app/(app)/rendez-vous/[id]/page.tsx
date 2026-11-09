import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatLabResultFr, formatNumberFr, getAnalyte, REMINDER_OPTIONS } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { appointments, documents } from '@/lib/server/auth';
import { labResults } from '@/lib/server/data';
import { deleteAppointmentAction, linkAppointmentAction, unlinkAppointmentAction } from '@/lib/server/actions';
import { Button, ButtonLink, buttonClass, Card, CardHeader, Chip, Meta, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { appointmentWhen } from '@/components/rendez-vous-when';
import { AppointmentForm } from '@/components/appointment-form';
import { ModuleForbidden } from '@/components/module-forbidden';
import { analyteHref } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Rendez-vous' };

export default async function AppointmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cree?: string; modifie?: string }> }) {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') notFound();
  if (!moduleAllowed(ctx.active, 'appointments')) return <ModuleForbidden title="Rendez-vous" profileName={ctx.active.access.displayName} />;
  const { id } = await params;
  const sp = await searchParams;
  const pid = ctx.active.access.profileId;
  const a = await appointments().get(ctx.user, pid, id);
  if (!a) notFound();
  const canWrite = moduleAllowed(ctx.active, 'appointments', 'write');
  const canDocs = moduleAllowed(ctx.active, 'documents');
  const canLab = moduleAllowed(ctx.active, 'lab');
  const docs = canDocs ? await documents().list(ctx.user, pid) : [];
  const labs = canLab ? await labResults(ctx) : [];
  const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium' });
  const past = a.startsAt.getTime() < Date.now();
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(a.startsAt);
  const localTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(a.startsAt);
  const linkedDocs = new Set(a.links.map((l) => l.documentId).filter(Boolean));
  const linkedLabs = new Set(a.links.map((l) => l.labResultId).filter(Boolean));
  const labLabel = (r: (typeof labs)[number]) => `${getAnalyte(r.analyteCode)?.nameFr ?? r.analyteCode} ${formatLabResultFr(r)} · ${fmtD.format(r.sampledAt)}`;

  return (
    <div className="fade-in">
      <PageHeader
        title={[a.specialty, a.practitioner].filter(Boolean).join(' — ')}
        subtitle={<span className="block first-letter:uppercase">{appointmentWhen(a.startsAt)}</span>}
        actions={
          <Link href="/rendez-vous" className={buttonClass({ variant: 'ghost', className: '-ml-3' })}>
            <Icon name="chevronLeft" className="size-5" /> Rendez-vous
          </Link>
        }
      />
      {(sp.cree || sp.modifie) && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          {sp.cree ? 'Rendez-vous ajouté.' : 'Modifications enregistrées.'}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2">
              {a.location && (
                <>
                  <dt className="mt-2 text-ink-3 sm:mt-0">Lieu</dt>
                  <dd>{a.location}</dd>
                </>
              )}
              {a.reason && (
                <>
                  <dt className="mt-2 text-ink-3 sm:mt-0">Motif</dt>
                  <dd>{a.reason}</dd>
                </>
              )}
              {a.toPrepare && (
                <>
                  <dt className="mt-2 text-ink-3 sm:mt-0">À préparer</dt>
                  <dd className="whitespace-pre-line">{a.toPrepare}</dd>
                </>
              )}
              <dt className="mt-2 text-ink-3 sm:mt-0">Rappel</dt>
              <dd>{REMINDER_OPTIONS[String(a.reminderMinutes ?? '')] ?? 'Aucun'}</dd>
            </dl>
            {a.notesAfter && (
              <div className="mt-4 rounded-xl bg-surface-2 p-3.5">
                <p className="text-sm font-medium text-ink-3">Notes après la consultation</p>
                <p className="mt-1 whitespace-pre-line text-sm">{a.notesAfter}</p>
              </div>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {!past && (
                <a href={`/api/rendez-vous/${a.id}/ics`} className={buttonClass({ variant: 'primary' })}>
                  <Icon name="calendar" className="size-5" /> Ajouter à mon agenda
                </a>
              )}
              {!past && (
                <a href={`/api/rendez-vous/${a.id}/ics?details=1`} className={buttonClass({ variant: 'secondary' })}>
                  Avec les détails
                </a>
              )}
              <ButtonLink href="/rapports" variant={past ? 'secondary' : 'ghost'}>
                <Icon name="share" className="size-5" /> Préparer le rapport
              </ButtonLink>
            </div>
            {!past && (
              <Meta className="mt-2">
                Par discrétion, l’événement s’intitule « Rendez-vous médical ». « Avec les détails » ajoute la spécialité, le lieu et la préparation.
              </Meta>
            )}
          </Card>

          <Card>
            <CardHeader title="Documents et résultats à apporter" />
            {a.links.length === 0 && <p className="text-sm text-ink-2">Aucun élément associé.</p>}
            <ul className="divide-y divide-line">
              {a.links.map((l) => {
                const d = l.documentId ? docs.find((x) => x.id === l.documentId) : null;
                const r = l.labResultId ? labs.find((x) => x.id === l.labResultId) : null;
                const label = d ? `${d.kind === 'lab_report' ? 'Bilan sanguin' : d.title}${d.document_date ? ` · ${fmtD.format(new Date(`${d.document_date}T12:00:00Z`))}` : ''}` : r ? labLabel(r) : 'Élément non accessible ou supprimé';
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    {d ? <Link href={`/documents/${d.id}`} className="text-petrol underline">{label}</Link> : r ? <Link href={analyteHref(r.analyteCode)} className="text-petrol underline">{label}</Link> : <span className="text-ink-3">{label}</span>}
                    {canWrite && (
                      <form action={unlinkAppointmentAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="linkId" value={l.id} />
                        <Button type="submit" variant="ghost">
                          Retirer
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {canWrite && (canDocs || canLab) && (
              <form action={linkAppointmentAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={a.id} />
                <select name="target" required defaultValue="" aria-label="Document ou résultat à associer" className="min-h-12 w-full min-w-0 flex-1 rounded-xl border border-line bg-surface px-3">
                  <option value="" disabled>
                    Associer un document ou un résultat…
                  </option>
                  {docs.filter((d) => !linkedDocs.has(d.id)).length > 0 && (
                    <optgroup label="Documents">
                      {docs.filter((d) => !linkedDocs.has(d.id)).map((d) => (
                        <option key={d.id} value={`doc:${d.id}`}>
                          {d.kind === 'lab_report' ? 'Bilan sanguin' : d.title}
                          {d.document_date ? ` · ${d.document_date}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {labs.filter((r) => r.id && !linkedLabs.has(r.id)).length > 0 && (
                    <optgroup label="Résultats d’analyses">
                      {[...labs].reverse().filter((r) => r.id && !linkedLabs.has(r.id)).map((r) => (
                        <option key={r.id!} value={`lab:${r.id}`}>
                          {labLabel(r)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <Button type="submit">Associer</Button>
              </form>
            )}
          </Card>
          {canWrite && (
            <ConfirmDelete action={deleteAppointmentAction} fields={{ id: a.id }} label="Supprimer ce rendez-vous" className="-ml-3" />
          )}
        </div>
        {canWrite && (
          <Card>
            <CardHeader title={past ? 'Compléter après la consultation' : 'Modifier'} />
            {past && <Chip tone="neutral">Consultation passée</Chip>}
            <div className={past ? 'mt-3' : ''}>
              <AppointmentForm
                showNotes
                initial={{
                  id: a.id,
                  date: localDate,
                  time: localTime,
                  specialty: a.specialty ?? '',
                  practitioner: a.practitioner ?? '',
                  location: a.location ?? '',
                  reason: a.reason ?? '',
                  toPrepare: a.toPrepare ?? '',
                  reminder: a.reminderMinutes ? String(a.reminderMinutes) : '',
                  notesAfter: a.notesAfter ?? '',
                }}
              />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
