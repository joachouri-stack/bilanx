import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatLocalDate } from '@bilanx/domain';
import { isOngoing, lastDay, type MedicationRow } from '@bilanx/records';
import { DEMO_MEDICATIONS, demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { medications } from '@/lib/server/auth';
import { deleteMedicationAction } from '@/lib/server/actions';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
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
    <details className="rounded-xl border border-line p-3.5">
      <summary className="cursor-pointer text-sm font-medium text-petrol">{title}</summary>
      <div className="mt-3">{children}</div>
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
  const msg = sp.cree ? 'Traitement ajouté.' : sp.modifie ? 'Saisie corrigée.' : sp.change ? 'Nouvelle prescription enregistrée ; l’ancienne est conservée dans l’historique.' : sp.arrete ? 'Arrêt enregistré.' : null;
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
        subtitle={`Profil : ${name}${isDemo ? ' (démonstration, données fictives)' : ''}`}
        actions={
          <Link href="/medicaments" className="text-sm text-ink-3 hover:text-ink">
            ← Médicaments
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
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-medium">{m.posology}</p>
              {active && m.startDate && m.startDate > today ? <Chip tone="petrol">à venir</Chip> : active ? <Chip tone="sage">en cours</Chip> : <Chip tone="neutral">{m.status === 'stopped' ? 'arrêté' : 'terminé'}</Chip>}
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-ink-3">Prises</dt>
              <dd>
                {m.schedule.length
                  ? m.schedule.map((s) => `${s.time.replace(':', ' h ')}${s.qty ? ` (${s.qty})` : ''}`).join(' · ')
                  : 'Sans horaire fixe : pas de suivi ni de rappel quotidien'}
              </dd>
              <dt className="text-ink-3">Période</dt>
              <dd>{period(m)}</dd>
              {m.stopReason && (
                <>
                  <dt className="text-ink-3">Motif d’arrêt</dt>
                  <dd>{m.stopReason}</dd>
                </>
              )}
              <dt className="text-ink-3">Prescrit par</dt>
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
                'Traitement recopié de l’ordonnance par l’utilisateur.'
              )}{' '}
              BILANX ne le modifie jamais et ne propose aucune dose.
            </Meta>
          </Card>

          {active && m.schedule.length > 0 && (
            <Card>
              <h2 className="font-semibold">Rappels dans l’agenda du téléphone</h2>
              <p className="mt-1 text-sm text-ink-2">
                Ajoutez à votre agenda un rappel quotidien à chaque heure de prise{until ? `, jusqu’au ${dateFr(until)} inclus` : ''}. C’est votre agenda qui
                déclenche l’alerte, même sans ouvrir BILANX. Autre possibilité : les{' '}
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
                    <a href={`/api/medicaments/${m.id}/ics`} className="inline-flex min-h-11 items-center rounded-xl bg-petrol px-4 font-medium text-on-accent">
                      ⏰ Ajouter les rappels à mon agenda
                    </a>
                    <a href={`/api/medicaments/${m.id}/ics?details=1`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm">
                      Avec le nom du médicament
                    </a>
                  </div>
                  <Meta className="mt-2">
                    Par défaut, le rappel s’intitule « Prise de traitement » : votre agenda est souvent synchronisé chez un service tiers. Si le traitement
                    change ou s’arrête, supprimez les rappels de votre agenda : ils ne se mettent pas à jour automatiquement.
                  </Meta>
                </>
              )}
            </Card>
          )}

          {m.history.length > 0 && (
            <Card>
              <h2 className="font-semibold">Prescriptions précédentes</h2>
              <ol className="mt-3 flex flex-col gap-3 border-l-2 border-line pl-4">
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
          <div className="flex flex-col gap-3">
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
            <Section title="Supprimer cette saisie">
              <p className="text-sm text-ink-2">À utiliser seulement pour une saisie erronée. Pour un traitement arrêté, préférez « Le traitement est arrêté » : l’historique est conservé.</p>
              <form action={deleteMedicationAction} className="mt-3">
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="min-h-11 rounded-xl bg-red-2 px-4 text-sm font-medium text-red">
                  Supprimer définitivement de la liste
                </button>
              </form>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}
