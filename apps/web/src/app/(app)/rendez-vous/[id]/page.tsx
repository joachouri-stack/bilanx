import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatNumberFr, getAnalyte, REMINDER_OPTIONS } from '@bilanx/domain';
import { DEMO_TIMEZONE } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { appointments, documents } from '@/lib/server/auth';
import { labResults } from '@/lib/server/data';
import { deleteAppointmentAction, linkAppointmentAction, unlinkAppointmentAction } from '@/lib/server/actions';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { AppointmentForm } from '@/components/appointment-form';
import { ModuleForbidden } from '@/components/module-forbidden';

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
  const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, dateStyle: 'medium' });
  const past = a.startsAt.getTime() < Date.now();
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIMEZONE }).format(a.startsAt);
  const localTime = new Intl.DateTimeFormat('fr-FR', { timeZone: DEMO_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(a.startsAt);
  const linkedDocs = new Set(a.links.map((l) => l.documentId).filter(Boolean));
  const linkedLabs = new Set(a.links.map((l) => l.labResultId).filter(Boolean));
  const labLabel = (r: (typeof labs)[number]) => `${getAnalyte(r.analyteCode)?.nameFr ?? r.analyteCode} ${formatNumberFr(r.value)} ${r.unit} · ${fmtD.format(r.sampledAt)}`;

  return (
    <div className="fade-in">
      <PageHeader
        title={[a.specialty, a.practitioner].filter(Boolean).join(' — ')}
        subtitle={<span className="first-letter:uppercase">{fmt.format(a.startsAt)}</span>}
        actions={
          <Link href="/rendez-vous" className="text-sm text-ink-3 hover:text-ink">
            ← Rendez-vous
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
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {a.location && (
                <>
                  <dt className="text-ink-3">Lieu</dt>
                  <dd>{a.location}</dd>
                </>
              )}
              {a.reason && (
                <>
                  <dt className="text-ink-3">Motif</dt>
                  <dd>{a.reason}</dd>
                </>
              )}
              {a.toPrepare && (
                <>
                  <dt className="text-ink-3">À préparer</dt>
                  <dd className="whitespace-pre-line">{a.toPrepare}</dd>
                </>
              )}
              <dt className="text-ink-3">Rappel</dt>
              <dd>{REMINDER_OPTIONS[String(a.reminderMinutes ?? '')] ?? 'Aucun'}</dd>
            </dl>
            {a.notesAfter && (
              <div className="mt-4 rounded-xl bg-surface-2 p-3.5">
                <p className="text-xs font-medium text-ink-3">Notes après la consultation</p>
                <p className="mt-1 whitespace-pre-line text-sm">{a.notesAfter}</p>
              </div>
            )}
            {!past && (
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`/api/rendez-vous/${a.id}/ics`} className="inline-flex min-h-11 items-center rounded-xl bg-petrol px-4 font-medium text-white">
                  📅 Ajouter à mon agenda
                </a>
                <a href={`/api/rendez-vous/${a.id}/ics?details=1`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm">
                  Avec les détails
                </a>
              </div>
            )}
            {!past && (
              <Meta className="mt-2">
                Par défaut, l’événement s’intitule « Rendez-vous médical » : votre agenda est souvent synchronisé chez un service tiers. « Avec les détails » y ajoute la
                spécialité, le lieu et la préparation.
              </Meta>
            )}
          </Card>

          <Card>
            <h2 className="font-semibold">Documents et résultats à apporter</h2>
            {a.links.length === 0 && <p className="mt-2 text-sm text-ink-3">Aucun élément associé.</p>}
            <ul className="mt-2 divide-y divide-line">
              {a.links.map((l) => {
                const d = l.documentId ? docs.find((x) => x.id === l.documentId) : null;
                const r = l.labResultId ? labs.find((x) => x.id === l.labResultId) : null;
                const label = d ? `📄 ${d.kind === 'lab_report' ? 'Bilan biologique' : d.title}${d.document_date ? ` · ${fmtD.format(new Date(`${d.document_date}T12:00:00Z`))}` : ''}` : r ? `🧪 ${labLabel(r)}` : 'Élément non accessible ou supprimé';
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    {d ? <Link href={`/documents/${d.id}`} className="text-petrol underline">{label}</Link> : r ? <Link href={`/analyses/${r.analyteCode}`} className="text-petrol underline">{label}</Link> : <span className="text-ink-3">{label}</span>}
                    {canWrite && (
                      <form action={unlinkAppointmentAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="linkId" value={l.id} />
                        <button type="submit" className="text-xs text-ink-3 underline">
                          Retirer
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {canWrite && (canDocs || canLab) && (
              <form action={linkAppointmentAction} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="id" value={a.id} />
                <select name="target" required defaultValue="" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm">
                  <option value="" disabled>
                    Associer un document ou un résultat…
                  </option>
                  {docs.filter((d) => !linkedDocs.has(d.id)).length > 0 && (
                    <optgroup label="Documents">
                      {docs.filter((d) => !linkedDocs.has(d.id)).map((d) => (
                        <option key={d.id} value={`doc:${d.id}`}>
                          {d.kind === 'lab_report' ? 'Bilan biologique' : d.title}
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
                <button type="submit" className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2">
                  Associer
                </button>
              </form>
            )}
          </Card>
          {canWrite && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-3">Supprimer ce rendez-vous</summary>
              <form action={deleteAppointmentAction} className="mt-2">
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" className="rounded-lg bg-red-2 px-3 py-2 font-medium text-red">
                  Confirmer la suppression
                </button>
              </form>
            </details>
          )}
        </div>
        {canWrite && (
          <Card>
            <h2 className="mb-3 font-semibold">{past ? 'Compléter après la consultation' : 'Modifier'}</h2>
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
