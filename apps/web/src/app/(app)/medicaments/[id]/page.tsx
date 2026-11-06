import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatLocalDate } from '@bilanx/domain';
import { isOngoing, lastDay, type MedicationRow } from '@bilanx/records';
import { DEMO_MEDICATIONS, demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { medications } from '@/lib/server/auth';
import { deleteMedicationAction } from '@/lib/server/actions';
import { buttonClass, Card, CardHeader, Chip, Meta, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { MedicationForm, StopMedicationForm } from '@/components/medication-forms';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Médicament' };

const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });
const dateFr = (iso: string) => fmtD.format(new Date(`${iso}T12:00:00Z`));
const period = (m: MedicationRow) =>
  [m.startDate ? `depuis le ${dateFr(m.startDate)}` : 'date de début non précisée', m.stoppedOn ? `arrêté à partir du ${dateFr(m.stoppedOn)}` : m.endDate ? `jusqu’au ${dateFr(m.endDate)} inclus` : null]
    .filter(Boolean)
    .join(' · ');

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group card min-w-0 px-5 py-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 font-medium [&::-webkit-details-marker]:hidden">
        {title}
        <Icon name="chevronDown" className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-4 pt-2">{children}</div>
    </details>
  );
}

export default async function MedicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cree?: string; modifie?: string; change?: string; arrete?: string }>;
}) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'medications')) return <ModuleForbidden title="Médicaments" profileName={name} />;
  const { id } = await params;
  const sp = await searchParams;
  const isDemo = ctx.active.kind === 'demo';
  const m =
    ctx.active.kind === 'real'
      ? await medications().get(ctx.user, ctx.active.access.profileId, id)
      : (() => {
          const d = DEMO_MEDICATIONS.find((x) => x.id === id);
          return d ? { ...d, history: [] } : null;
        })();
  if (!m) notFound();
  const canWrite = !isDemo && moduleAllowed(ctx.active, 'medications', 'write');
  const today = formatLocalDate(demoToday());
  const active = isOngoing(m, today);
  const until = lastDay(m);
  const msg = sp.cree ? 'Médicament ajouté.' : sp.modifie ? 'Saisie corrigée.' : sp.change ? 'Nouvelle prescription enregistrée ; l’ancienne est conservée dans l’historique.' : sp.arrete ? 'Arrêt enregistré.' : null;
  const defaults = {
    id: m.id,
    name: m.name,
    strength: m.strength ?? '',
    posology: m.posology,
    slots: m.schedule,
    startDate: m.startDate ?? '',
    endDate: m.endDate ?? '',
    prescriber: m.prescriber ?? '',
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={`${m.name}${m.strength ? ` ${m.strength}` : ''}`}
        actions={
          <Link href="/medicaments" className={buttonClass({ variant: 'ghost', className: '-ml-3' })}>
            <Icon name="chevronLeft" className="size-5" /> Médicaments
          </Link>
        }
      />
      {msg && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          {msg}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 text-lg font-medium">{m.posology}</p>
              {active && m.startDate && m.startDate > today ? <Chip tone="petrol">à venir</Chip> : active ? <Chip tone="sage">en cours</Chip> : <Chip tone="neutral">{m.status === 'stopped' ? 'arrêté' : 'terminé'}</Chip>}
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2">
              <dt className="mt-2 text-ink-3 first:mt-0 sm:mt-0">Prises</dt>
              <dd>
                {m.schedule.length
                  ? m.schedule.map((s) => `${s.time.replace(':', ' h ')}${s.qty ? ` (${s.qty})` : ''}`).join(' · ')
                  : 'Sans horaire fixe : pas de suivi ni de rappel quotidien'}
              </dd>
              <dt className="mt-2 text-ink-3 first:mt-0 sm:mt-0">Période</dt>
              <dd>{period(m)}</dd>
              {m.stopReason && (
                <>
                  <dt className="mt-2 text-ink-3 first:mt-0 sm:mt-0">Motif d’arrêt</dt>
                  <dd>{m.stopReason}</dd>
                </>
              )}
              <dt className="mt-2 text-ink-3 first:mt-0 sm:mt-0">Prescrit par</dt>
              <dd>{m.prescriber ?? 'Non précisé'}</dd>
            </dl>
            <Meta className="mt-3">
              {m.documentId ? (
                <>
                  Lu sur une{' '}
                  <Link href={`/documents/${m.documentId}`} className="text-petrol underline">
                    ordonnance déposée
                  </Link>{' '}
                  puis vérifié et confirmé par l’utilisateur.
                </>
              ) : (
                'Recopié de l’ordonnance.'
              )}{' '}
              BILANX ne le modifie jamais et ne propose aucune dose.
            </Meta>
          </Card>

          {active && m.schedule.length > 0 && (
            <Card>
              <CardHeader title="Rappels dans l’agenda du téléphone" />
              <p className="text-sm text-ink-2">
                Un rappel par jour à chaque heure de prise{until ? `, jusqu’au ${dateFr(until)} inclus` : ''}, déclenché par votre agenda même sans ouvrir
                BILANX. Autre possibilité : les{' '}
                <Link href="/medicaments#rappels" className="text-petrol underline">
                  notifications BILANX
                </Link>
                , qui s’adaptent aux changements de traitement.
              </p>
              {isDemo ? (
                <p className="mt-3 text-sm text-ink-3">Non disponible pour le profil de démonstration.</p>
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`/api/medicaments/${m.id}/ics`} className={buttonClass({ variant: 'primary', className: 'w-full whitespace-normal text-center sm:w-auto' })}>
                      <Icon name="calendar" className="size-5" /> Ajouter les rappels à mon agenda
                    </a>
                    <a href={`/api/medicaments/${m.id}/ics?details=1`} className={buttonClass({ variant: 'secondary', className: 'w-full whitespace-normal text-center sm:w-auto' })}>
                      Avec le nom du médicament
                    </a>
                  </div>
                  <Meta className="mt-2">
                    Par défaut, le rappel s’intitule « Prise de traitement », par discrétion. Si le traitement change ou s’arrête, supprimez ces rappels de votre
                    agenda : ils ne se mettent pas à jour seuls.
                  </Meta>
                </>
              )}
            </Card>
          )}

          {m.history.length > 0 && (
            <Card>
              <CardHeader title="Prescriptions précédentes" />
              <ol className=" flex flex-col gap-3 border-l-2 border-line pl-4">
                {m.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[23px] top-1.5 size-3 rounded-full bg-ink-3" aria-hidden />
                    <p className="text-sm font-medium">
                      {h.name}
                      {h.strength ? ` ${h.strength}` : ''} · <span className="font-normal">{h.posology}</span>
                    </p>
                    <Meta>
                      {period(h)}
                      {h.prescriber ? ` · prescrit par ${h.prescriber}` : ''}
                    </Meta>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        {canWrite && (
          <div className="flex min-w-0 flex-col gap-3">
            {m.status === 'active' && (
              <Section title="Le médecin a changé la prescription">
                <MedicationForm initial={defaults} mode="change" today={today} />
              </Section>
            )}
            {m.status === 'active' && (
              <Section title="Le traitement est arrêté">
                <StopMedicationForm id={m.id} today={today} />
              </Section>
            )}
            <Section title="Corriger une erreur de saisie">
              <MedicationForm initial={defaults} mode="edit" today={today} />
            </Section>
            <Section title="Supprimer ce médicament">
              <p className="text-sm text-ink-2">Seulement pour une erreur de saisie. Pour un traitement arrêté, choisissez plutôt « Le traitement est arrêté » : l’historique est conservé.</p>
              <ConfirmDelete
                action={deleteMedicationAction}
                fields={{ id: m.id }}
                className="mt-2 -ml-3"
                confirmLabel="Confirmer la suppression"
                question="Ce médicament sera retiré de la liste."
              />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
