import type { Metadata } from 'next';
import Link from 'next/link';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { documents } from '@/lib/server/auth';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { UploadForm } from '@/components/document-forms';
import { ModuleForbidden } from '@/components/module-forbidden';
import { DOC_CATEGORIES, EXAM_LABELS, categoryByKey, categoryOf, documentTitle } from '@/lib/document-categories';

export const metadata: Metadata = { title: 'Documents' };

const STATUS: Record<string, { label: string; tone: 'amber' | 'sage' | 'neutral' | 'red' }> = {
  to_review: { label: 'À valider', tone: 'amber' },
  failed: { label: 'Lecture impossible', tone: 'red' },
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ supprime?: string; cat?: string; ajouter?: string }> }) {
  const ctx = await appContext();
  const sp = await searchParams;
  if (ctx.active.kind === 'demo') {
    return (
      <div className="fade-in">
        <PageHeader title="Documents" />
        <Card className="max-w-xl">
          <p className="text-sm text-ink-2">Le profil de démonstration ne contient pas de documents. Choisissez votre profil dans le sélecteur pour importer une ordonnance ou un bilan.</p>
        </Card>
      </div>
    );
  }
  if (!moduleAllowed(ctx.active, 'documents')) return <ModuleForbidden title="Documents" profileName={ctx.active.access.displayName} />;
  const canWrite = moduleAllowed(ctx.active, 'documents', 'write');
  const all = await documents().list(ctx.user, ctx.active.access.profileId);
  const cat = categoryByKey(sp.cat);
  const list = cat ? all.filter((d) => cat.kinds.includes(d.kind)) : all;
  const count = (kinds: string[]) => all.filter((d) => kinds.includes(d.kind)).length;
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
  const fmtDay = (iso: string) => fmt.format(new Date(`${iso}T12:00:00Z`));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const tile = 'flex min-h-20 flex-col justify-between gap-1 rounded-2xl border p-3 text-left transition hover:bg-surface-2';

  return (
    <div className="fade-in">
      <PageHeader
        title={cat ? cat.label : 'Documents'}
        subtitle={`Profil : ${ctx.active.access.displayName}`}
        actions={
          canWrite ? (
            <a href="#ajouter" className="inline-grid min-h-11 place-items-center rounded-xl bg-petrol px-4 font-semibold text-on-accent">
              ＋ Ajouter un document
            </a>
          ) : undefined
        }
      />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Document supprimé. Les résultats déjà validés restent dans vos analyses.
        </p>
      )}

      <nav aria-label="Catégories de documents" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Link href="/documents" aria-current={!cat ? 'page' : undefined} className={`${tile} ${!cat ? 'border-petrol bg-petrol-2' : 'border-line bg-surface'}`}>
          <span className="text-xl" aria-hidden>
            🗂️
          </span>
          <span className="text-sm font-semibold">Tous</span>
          <span className="tabular text-xs text-ink-3">{all.length} document(s)</span>
        </Link>
        {DOC_CATEGORIES.map((c) => (
          <Link key={c.key} href={`/documents?cat=${c.key}`} aria-current={cat?.key === c.key ? 'page' : undefined} className={`${tile} ${cat?.key === c.key ? 'border-petrol bg-petrol-2' : 'border-line bg-surface'}`}>
            <span className="text-xl" aria-hidden>
              {c.icon}
            </span>
            <span className="text-sm font-semibold">{c.label}</span>
            <span className="tabular text-xs text-ink-3">{count(c.kinds)} document(s)</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <h2 className="font-semibold">{cat ? `${cat.label} — du plus récent au plus ancien` : 'Tous mes documents'}</h2>
          {list.length === 0 ? (
            <p className="mt-2 text-sm text-ink-3">{cat ? `Aucun document dans « ${cat.label} ».` : 'Aucun document pour l’instant.'}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {list.map((d) => {
                const st = d.job_status ? STATUS[d.job_status] : null;
                const c = categoryOf(d.kind);
                const isImage = d.mime_type.startsWith('image/');
                return (
                  <li key={d.id} className="flex items-center gap-3 py-2.5">
                    <Link href={`/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl hover:bg-surface-2">
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element -- original déchiffré servi par une route authentifiée
                        <img src={`/api/documents/${d.id}/pages/1`} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg border border-line bg-white object-cover" />
                      ) : (
                        <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-[11px] font-semibold text-ink-3" aria-hidden>
                          PDF
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          <span aria-hidden>{c.icon} </span>
                          {documentTitle(d)}
                          {d.kind === 'imaging' && d.exam_type && documentTitle(d) !== EXAM_LABELS[d.exam_type] ? ` · ${EXAM_LABELS[d.exam_type]}` : ''}
                        </span>
                        <span className="block truncate text-xs text-ink-3">
                          {d.document_date ? fmtDay(d.document_date) : `Ajouté le ${fmt.format(d.uploaded_at)}`}
                          {d.issuer ? ` · ${d.issuer}` : ''} · {d.page_count} page{d.page_count > 1 ? 's' : ''}
                        </span>
                        {st && (
                          <span className="mt-0.5 block">
                            <Chip tone={st.tone}>{d.job_status === 'to_review' ? `${d.pending} à valider` : st.label}</Chip>
                          </span>
                        )}
                      </span>
                    </Link>
                    <a
                      href={`/api/documents/${d.id}/pages/1`}
                      target="_blank"
                      rel="noopener"
                      className="inline-grid min-h-11 shrink-0 place-items-center rounded-xl border border-line px-3 text-sm font-medium hover:bg-surface-2"
                      aria-label={`Ouvrir le fichier : ${documentTitle(d)}`}
                    >
                      Ouvrir
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
          <Meta className="mt-3">« Ouvrir » affiche le document original en plein écran : pratique pour le montrer à un médecin.</Meta>
        </Card>
        {canWrite && (
          <Card id="ajouter" className="scroll-mt-4">
            <h2 className="font-semibold">Ajouter un document</h2>
            <p className="mb-4 mt-1 text-sm text-ink-3">Depuis votre téléphone : prenez une photo, ou choisissez un PDF ou une image (Photos, Fichiers, e-mail…).</p>
            <UploadForm today={today} defaultKind={cat?.kind ?? ''} />
          </Card>
        )}
      </div>
    </div>
  );
}
