import type { Metadata } from 'next';
import { SHARE_DURATIONS, SHARE_MAX_VIEWS, type ShareRow } from '@bilanx/records';
import { sharing } from '@/lib/server/auth';
import { revokeShareAction } from '@/lib/server/actions';
import { CreateShareForm } from '@/components/share-forms';
import { addDays, formatLocalDate } from '@bilanx/domain';
import { SECTION_KEYS, SECTION_LABELS } from '@bilanx/reports';
import { demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { SECTION_MODULE } from '@/lib/server/report-data';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { ModuleForbidden } from '@/components/module-forbidden';
import { ReportForm } from '@/components/report-form';

export const metadata: Metadata = { title: 'Rapports PDF' };


const STATUS: Record<ShareRow['status'], [string, 'sage' | 'neutral' | 'red' | 'amber']> = {
  active: ['actif', 'sage'],
  expired: ['expiré', 'neutral'],
  revoked: ['révoqué', 'neutral'],
  locked: ['verrouillé (codes erronés)', 'red'],
  exhausted: ['ouvertures épuisées', 'amber'],
};
const fmtDT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'medium', timeStyle: 'short' });
const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'medium' });
const day = (iso: string) => fmtD.format(new Date(`${iso}T12:00:00Z`));

async function ShareRowView({ r, log }: { r: ShareRow; log: { occurred_at: Date; success: boolean; user_agent: string | null }[] }) {
  const [label, tone] = STATUS[r.status];
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block font-medium">{r.recipient ?? 'Destinataire non précisé'}</span>
          <span className="block text-xs text-ink-3">
            Rapport du {day(r.periodStart)} au {day(r.periodEnd)} · créé le {fmtDT.format(r.createdAt)} · {r.status === 'active' ? 'expire' : 'expirait'} le{' '}
            {fmtDT.format(r.expiresAt)}
          </span>
          <span className="block text-xs text-ink-3">
            {r.views} ouverture{r.views > 1 ? 's' : ''}
            {r.maxViews ? ` sur ${r.maxViews}` : ''}
            {r.failures ? ` · ${r.failures} code${r.failures > 1 ? 's' : ''} erroné${r.failures > 1 ? 's' : ''}` : ''}
            {r.lastAccessAt ? ` · dernier accès le ${fmtDT.format(r.lastAccessAt)}` : ''}
          </span>
        </span>
        <Chip tone={tone}>{label}</Chip>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {log.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-petrol underline">Journal des accès</summary>
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-2">
              {log.map((l, i) => (
                <li key={i}>
                  {fmtDT.format(l.occurred_at)} · {l.success ? 'rapport ouvert' : 'code erroné'}
                  {l.user_agent ? ` · ${l.user_agent.slice(0, 60)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
        {r.status !== 'revoked' && r.status !== 'expired' && (
          <form action={revokeShareAction}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="text-xs font-medium text-red underline">
              Révoquer maintenant
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ partage?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire (démonstration)';
  if (!moduleAllowed(ctx.active, 'reports')) return <ModuleForbidden title="Rapports PDF" profileName={name} />;
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
      <PageHeader title="Rapports PDF" subtitle={`Profil : ${name}`} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <h2 className="font-semibold">Préparer un rapport pour la consultation</h2>
          <ReportForm
            sections={allowed.map((k) => ({ key: k, label: SECTION_LABELS[k] }))}
            today={formatLocalDate(today)}
            minDate={formatLocalDate(addDays(today, -730))}
          />
          {blocked.length > 0 && <Meta className="mt-3">Non autorisé pour vous sur ce profil : {blocked.map((k) => SECTION_LABELS[k]).join(', ')}.</Meta>}
        </Card>
        <Card>
          <h2 className="font-semibold">Contenu du rapport</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Données disponibles par rubrique, avec leur source (bilan scanné, import, saisie manuelle).</li>
            <li>Glycémie : statistiques et profil sur 24 h ; GMI seulement s’il est fiable, et présenté comme une estimation.</li>
            <li>HbA1c aux dates réelles de prélèvement ; autres analyses avec les références de chaque laboratoire.</li>
            <li>Insuline : totaux par jour, modifications prescrites.</li>
            <li>Journal et rendez-vous.</li>
          </ul>
          <Meta className="mt-3">
            Les valeurs saisies à la main sont marquées (S). Les données absentes ou non autorisées sont signalées, jamais complétées. Le rapport n’est pas
            conservé par BILANX : il est produit à la demande (sauf la copie figée d’un partage, effacée à son expiration).
          </Meta>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-semibold" id="partages">
          Partager avec un professionnel de santé
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          Le professionnel reçoit un lien et un code (à lui transmettre séparément) pour consulter <strong>une copie figée</strong> du rapport,
          sans compte BILANX. Il ne voit rien d’autre, pas même vos données plus récentes. Accès limité dans le temps, révocable, journalisé ;
          vous êtes prévenu par e-mail à la première consultation.
        </p>
        {sp.partage === 'revoque' && (
          <p role="status" className="mt-3 rounded-xl bg-sage-2 px-4 py-3 text-sm">
            Partage révoqué : le lien ne fonctionne plus et la copie du rapport a été effacée.
          </p>
        )}
        <div className="mt-4 grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div>
            {ctx.active.kind === 'demo' ? (
              <p className="text-sm text-ink-3">Non disponible pour le profil de démonstration.</p>
            ) : !canShare ? (
              <p className="text-sm text-ink-3">Vous pouvez consulter les rapports de ce profil, mais pas les partager.</p>
            ) : (
              <CreateShareForm
                sections={allowed.map((k) => ({ key: k, label: SECTION_LABELS[k] }))}
                durations={Object.entries(SHARE_DURATIONS).map(([key, d]) => ({ key, label: d.label }))}
                maxViews={Object.entries(SHARE_MAX_VIEWS).map(([key, label]) => ({ key, label }))}
              />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">Partages</h3>
            {shares.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Aucun partage pour l’instant.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line" aria-label="Partages">
                {shares.map((r, i) => (
                  <ShareRowView key={r.id} r={r} log={logs[i] ?? []} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
