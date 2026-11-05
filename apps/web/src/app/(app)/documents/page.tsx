import type { Metadata } from 'next';
import Link from 'next/link';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { documents } from '@/lib/server/auth';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { UploadForm } from '@/components/document-forms';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Documents & Scanner' };

const STATUS: Record<string, { label: string; tone: 'amber' | 'sage' | 'neutral' | 'red' }> = {
  to_review: { label: 'À valider', tone: 'amber' },
  reviewed: { label: 'Traité', tone: 'sage' },
  failed: { label: 'Lecture impossible', tone: 'red' },
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const ctx = await appContext();
  const sp = await searchParams;
  if (ctx.active.kind === 'demo') {
    return (
      <div className="fade-in">
        <PageHeader title="Documents & Scanner" />
        <Card className="max-w-xl">
          <p className="text-sm text-ink-2">Le profil de démonstration ne contient pas de documents. Choisissez votre profil dans le sélecteur pour scanner un bilan.</p>
        </Card>
      </div>
    );
  }
  if (!moduleAllowed(ctx.active, 'documents')) return <ModuleForbidden title="Documents & Scanner" profileName={ctx.active.access.displayName} />;
  const canWrite = moduleAllowed(ctx.active, 'documents', 'write');
  const list = await documents().list(ctx.user, ctx.active.access.profileId);
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

  return (
    <div className="fade-in">
      <PageHeader title="Documents & Scanner" subtitle={`Profil : ${ctx.active.access.displayName}`} />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Document supprimé. Les résultats déjà validés restent dans vos analyses.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <Card>
          <h2 className="font-semibold">Mes documents</h2>
          {list.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">Aucun document pour l’instant.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {list.map((d) => {
                const st = d.job_status ? STATUS[d.job_status] : null;
                return (
                  <li key={d.id}>
                    <Link href={`/documents/${d.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-surface-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{d.kind === 'lab_report' ? 'Bilan biologique' : d.kind === 'prescription' ? 'Ordonnance' : d.title}</span>
                        <span className="text-xs text-ink-3">
                          {d.document_date ? `Prélèvement du ${fmt.format(new Date(`${d.document_date}T12:00:00Z`))}` : `Déposé le ${fmt.format(d.uploaded_at)}`}
                          {d.issuer ? ` · ${d.issuer}` : ''} · {d.page_count} page{d.page_count > 1 ? 's' : ''}
                        </span>
                      </span>
                      {st ? <Chip tone={st.tone}>{d.job_status === 'to_review' ? `${d.pending} à valider` : st.label}</Chip> : <Chip tone="neutral">Non lu</Chip>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        {canWrite && (
          <Card>
            <h2 className="font-semibold">Scanner un document</h2>
            <p className="mb-4 mt-1 text-sm text-ink-3">Bilan sanguin ou ordonnance : les valeurs ou les traitements détectés vous seront proposés un par un.</p>
            <UploadForm />
          </Card>
        )}
      </div>
      <Meta className="mt-4">
        Prochainement : comptes rendus, photos HEIC, PDF scannés sans texte, analyse antivirus des fichiers.
      </Meta>
    </div>
  );
}
