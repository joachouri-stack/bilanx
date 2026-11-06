import type { Metadata } from 'next';
import Link from 'next/link';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { documents } from '@/lib/server/auth';
import { Card, Chip, EmptyState, Meta, PageHeader, buttonClass } from '@/components/ui';
import { DocumentsAdd } from '@/components/documents-add';
import { DocIcon } from '@/components/documents-icons';
import { ModuleForbidden } from '@/components/module-forbidden';
import { DOC_CATEGORIES, EXAM_LABELS, categoryByKey, categoryOf, documentTitle } from '@/lib/document-categories';

export const metadata: Metadata = { title: 'Documents' };

const STATUS: Record<string, { label: string; tone: 'amber' | 'sage' | 'neutral' | 'red' }> = {
  to_review: { label: 'À valider', tone: 'amber' },
  failed: { label: 'Lecture impossible', tone: 'red' },
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ supprime?: string; cat?: string; ajouter?: string }> }) {
  const ctx = await appContext();
  const sp = await searchParams;
  const cat = categoryByKey(sp.cat);
  if (ctx.active.kind === 'demo') {
    return (
      <div className="fade-in">
        <PageHeader title={cat?.label ?? 'Documents'} />
        <EmptyState
          title="Pas de documents dans la démonstration"
          description="Choisissez votre profil dans le sélecteur pour ajouter une ordonnance ou un bilan sanguin."
        />
      </div>
    );
  }
  if (!moduleAllowed(ctx.active, 'documents')) return <ModuleForbidden title={cat?.label ?? 'Documents'} profileName={ctx.active.access.displayName} />;
  const canWrite = moduleAllowed(ctx.active, 'documents', 'write');
  const all = await documents().list(ctx.user, ctx.active.access.profileId);
  const list = cat ? all.filter((d) => cat.kinds.includes(d.kind)) : all;
  const count = (kinds: string[]) => all.filter((d) => kinds.includes(d.kind)).length;
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
  const fmtDay = (iso: string) => fmt.format(new Date(`${iso}T12:00:00Z`));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const chip = (current: boolean) =>
    `flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[15px] font-medium transition-colors ${
      current ? 'border-petrol bg-petrol text-on-accent' : 'border-line bg-surface text-ink hover:bg-surface-2'
    }`;
  const isPrescriptions = cat?.kind === 'prescription';

  return (
    <div className="fade-in">
      <PageHeader title={cat ? cat.label : 'Documents'} subtitle={ctx.active.access.displayName} />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Document supprimé. Les résultats déjà validés restent dans vos analyses.
        </p>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        {canWrite && (
          <DocumentsAdd
            today={today}
            defaultKind={cat?.kind ?? ''}
            label={isPrescriptions ? 'Ajouter une ordonnance' : 'Ajouter un document'}
            className="lg:sticky lg:top-4 lg:order-2"
          />
        )}

        <div className="flex min-w-0 flex-col gap-3 lg:order-1">
          <nav aria-label="Catégories de documents" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex snap-x gap-2 pb-1">
              <li>
                <Link href="/documents" aria-current={!cat ? 'page' : undefined} className={chip(!cat)}>
                  Tous <span className="tabular opacity-80">{all.length}</span>
                </Link>
              </li>
              {DOC_CATEGORIES.map((c) => (
                <li key={c.key}>
                  <Link href={`/documents?cat=${c.key}`} aria-current={cat?.key === c.key ? 'page' : undefined} className={chip(cat?.key === c.key)}>
                    <DocIcon name={c.svg} className="size-[18px] shrink-0" />
                    {c.label} <span className="tabular opacity-80">{count(c.kinds)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {list.length === 0 ? (
            <EmptyState
              title={cat ? `Aucun document dans « ${cat.label} ».` : 'Aucun document pour l’instant.'}
              description={canWrite ? 'Appuyez sur « Ajouter » pour photographier une page ou choisir un fichier.' : undefined}
            />
          ) : (
            <Card className="!p-2 sm:!p-3">
              <h2 className="sr-only">{cat ? `${cat.label}, du plus récent au plus ancien` : 'Tous les documents, du plus récent au plus ancien'}</h2>
              <ul className="divide-y divide-line">
                {list.map((d) => {
                  const st = d.job_status ? STATUS[d.job_status] : null;
                  const c = categoryOf(d.kind);
                  const isImage = d.mime_type.startsWith('image/');
                  const title = documentTitle(d);
                  return (
                    <li key={d.id} className="flex items-center gap-3 p-2">
                      <Link href={`/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-petrol">
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element -- original déchiffré servi par une route authentifiée
                          <img src={`/api/documents/${d.id}/pages/1`} alt="" loading="lazy" className="size-14 shrink-0 rounded-lg border border-line bg-white object-cover object-top" />
                        ) : (
                          <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-petrol" aria-hidden>
                            <DocIcon name={c.svg} className="size-6" />
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {title}
                            {d.kind === 'imaging' && d.exam_type && title !== EXAM_LABELS[d.exam_type] ? ` · ${EXAM_LABELS[d.exam_type]}` : ''}
                          </span>
                          <span className="block truncate text-sm text-ink-2">
                            {d.document_date ? fmtDay(d.document_date) : `Ajouté le ${fmt.format(d.uploaded_at)}`}
                            {d.issuer ? ` · ${d.issuer}` : ''}
                            {d.page_count > 1 ? ` · ${plural(d.page_count, 'page', 'pages')}` : ''}
                          </span>
                          {st && (
                            <span className="mt-1 block">
                              <Chip tone={st.tone}>{d.job_status === 'to_review' ? `${plural(d.pending, 'ligne', 'lignes')} à valider` : st.label}</Chip>
                            </span>
                          )}
                        </span>
                      </Link>
                      <a
                        href={`/api/documents/${d.id}/pages/1`}
                        target="_blank"
                        rel="noopener"
                        className={buttonClass({ variant: 'secondary', className: 'shrink-0 !px-4' })}
                        aria-label={`Ouvrir le fichier : ${title}`}
                      >
                        Ouvrir
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {list.length > 0 && <Meta>« Ouvrir » affiche l’original en plein écran : pratique pour le montrer à un médecin.</Meta>}
        </div>
      </div>
    </div>
  );
}
