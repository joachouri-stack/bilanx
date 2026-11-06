import type { Metadata } from 'next';
import { SHARE_DURATIONS, SHARE_MAX_VIEWS, type ShareRow } from '@bilanx/records';
import { sharing } from '@/lib/server/auth';
import { revokeShareAction } from '@/lib/server/actions';
import { addDays, formatLocalDate } from '@bilanx/domain';
import { SECTION_KEYS, SECTION_LABELS } from '@bilanx/reports';
import { demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { SECTION_MODULE } from '@/lib/server/report-data';
import { Card, CardHeader, Chip, EmptyState, Meta, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { ModuleForbidden } from '@/components/module-forbidden';
import { ReportForm } from '@/components/report-form';

export const metadata: Metadata = { title: 'Partager avec un soignant' };

const STATUS: Record<ShareRow['status'], [string, 'sage' | 'neutral' | 'red' | 'amber']> = {
  active: ['actif', 'sage'],
  expired: ['expiré', 'neutral'],
  revoked: ['arrêté', 'neutral'],
  locked: ['bloqué (codes erronés)', 'red'],
  exhausted: ['ouvertures épuisées', 'amber'],
};
const fmtDT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' });
const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'medium' });
const day = (iso: string) => fmtD.format(new Date(`${iso}T12:00:00Z`));
const dt = (d: Date) => fmtDT.format(d).replace(/(\d{2}):(\d{2})/, '$1 h $2');

function ShareRowView({ r, log }: { r: ShareRow; log: { occurred_at: Date; success: boolean; user_agent: string | null }[] }) {
  const [label, tone] = STATUS[r.status];
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium">{r.recipient ?? 'Destinataire non précisé'}</span>
          <Meta>
            Rapport du {day(r.periodStart)} au {day(r.periodEnd)} · {r.status === 'active' ? 'expire' : 'expirait'} le {dt(r.expiresAt)}
          </Meta>
          <Meta>
            {r.views} ouverture{r.views > 1 ? 's' : ''}
            {r.maxViews ? ` sur ${r.maxViews}` : ''}
            {r.failures ? ` · ${r.failures} code${r.failures > 1 ? 's' : ''} erroné${r.failures > 1 ? 's' : ''}` : ''}
            {r.lastAccessAt ? ` · dernier accès le ${dt(r.lastAccessAt)}` : ''}
          </Meta>
        </span>
        <Chip tone={tone}>{label}</Chip>
      </div>
      <div className="mt-1 flex flex-wrap items-start gap-x-3">
        {log.length > 0 && (
          <details className="group min-w-0">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-medium text-petrol [&::-webkit-details-marker]:hidden">
              <Icon name="chevronDown" className="size-4 transition-transform group-open:rotate-180" />
              Journal des accès
            </summary>
            <ul className="mb-2 space-y-0.5 text-[13px] text-ink-2">
              {log.map((l, i) => (
                <li key={i}>
                  {dt(l.occurred_at)} · {l.success ? 'rapport ouvert' : 'code erroné'}
                  {l.user_agent ? ` · ${l.user_agent.slice(0, 60)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
        {r.status !== 'revoked' && r.status !== 'expired' && (
          <ConfirmDelete
            action={revokeShareAction}
            fields={{ id: r.id }}
            label="Arrêter le partage"
            confirmLabel="Confirmer l’arrêt"
            question="Le lien ne fonctionnera plus et la copie du rapport sera effacée."
          />
        )}
      </div>
    </li>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ partage?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire (démonstration)';
  if (!moduleAllowed(ctx.active, 'reports')) return <ModuleForbidden title="Partager avec un soignant" profileName={name} />;
  const today = demoToday();
  const allowed = SECTION_KEYS.filter((k) => moduleAllowed(ctx.active, SECTION_MODULE[k]));
  const blocked = SECTION_KEYS.filter((k) => !allowed.includes(k));
  const sp = await searchParams;
  const canShare = ctx.active.kind === 'real' && moduleAllowed(ctx.active, 'reports', 'write');
  const shares = ctx.active.kind === 'real' ? await sharing().list(ctx.user, ctx.active.access.profileId) : [];
  const logs =
    ctx.active.kind === 'real'
      ? await Promise.all(shares.map((r) => sharing().accessLog(ctx.user, (ctx.active as { access: { profileId: string } }).access.profileId, r.id)))
      : [];

  return (
    <div className="fade-in">
      <PageHeader title="Partager avec un soignant" subtitle="Un rapport PDF de vos données, pour la consultation." />
      {sp.partage === 'revoque' && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Partage arrêté : le lien ne fonctionne plus et la copie du rapport a été effacée.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Préparer le rapport" />
          <ReportForm
            sections={allowed.map((k) => ({ key: k, label: SECTION_LABELS[k] }))}
            today={formatLocalDate(today)}
            minDate={formatLocalDate(addDays(today, -730))}
            share={
              canShare
                ? {
                    durations: Object.entries(SHARE_DURATIONS).map(([key, d]) => ({ key, label: d.label })),
                    maxViews: Object.entries(SHARE_MAX_VIEWS).map(([key, label]) => ({ key, label })),
                  }
                : undefined
            }
            shareUnavailable={ctx.active.kind === 'demo' ? 'Non disponible pour le profil de démonstration.' : 'Vous pouvez préparer les rapports de ce profil, mais pas les partager.'}
          />
          {blocked.length > 0 && <Meta className="mt-3">Non autorisé pour vous sur ce profil : {blocked.map((k) => SECTION_LABELS[k]).join(', ')}.</Meta>}
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          {ctx.active.kind === 'real' && (
            <Card id="partages" className="scroll-mt-20">
              <CardHeader title="Mes partages" />
              {shares.length === 0 ? (
                <EmptyState title="Aucun partage pour l’instant." />
              ) : (
                <ul className="divide-y divide-line" aria-label="Partages">
                  {shares.map((r, i) => (
                    <ShareRowView key={r.id} r={r} log={logs[i] ?? []} />
                  ))}
                </ul>
              )}
            </Card>
          )}
          <details className="group card min-w-0 px-5 py-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 font-semibold [&::-webkit-details-marker]:hidden">
              Contenu du rapport
              <Icon name="chevronDown" className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-1 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
              <li>Les données de chaque rubrique, avec leur source (bilan déposé, import, saisie).</li>
              <li>Glycémie : statistiques et profil sur 24 h ; HbA1c estimée par le capteur seulement si elle est fiable.</li>
              <li>HbA1c de laboratoire aux dates de prise de sang ; autres analyses avec les valeurs de référence du laboratoire.</li>
              <li>Insuline : totaux par jour et changements de dose décidés par le médecin.</li>
              <li>Médicaments, journal et rendez-vous.</li>
            </ul>
            <Meta className="mb-4 mt-3">
              Les valeurs saisies à la main sont marquées (S). Une donnée absente est signalée, jamais inventée. Le rapport ne remplace pas un avis médical.
            </Meta>
          </details>
        </div>
      </div>
    </div>
  );
}
