import type { Metadata } from 'next';
import Link from 'next/link';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { documents } from '@/lib/server/auth';
import { Chip, EmptyState, PageHeader, buttonClass } from '@/components/ui';
import { Icon } from '@/components/icon';
import { DocumentsAdd } from '@/components/documents-add';
import { DocIcon } from '@/components/documents-icons';
import { ModuleForbidden } from '@/components/module-forbidden';
import { DOC_CATEGORIES, DOC_SHORTCUTS, EXAM_LABELS, categoryByKey, categoryOf, documentTitle, folderByCode, specialtyByCode } from '@/lib/document-categories';

export const metadata: Metadata = { title: 'Documents' };

const STATUS: Record<string, { label: string; tone: 'amber' | 'sage' | 'neutral' | 'red' }> = {
  to_review: { label: 'À valider', tone: 'amber' },
  failed: { label: 'Lecture impossible', tone: 'red' },
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Bouton d'ajout pour un type d'examen d'imagerie (?examen=…). */
const ADD_EXAM: Record<string, string> = {
  irm: 'Ajouter une IRM',
  scanner: 'Ajouter un scanner',
  radio: 'Ajouter une radiographie',
  echo: 'Ajouter une échographie',
  autre: 'Ajouter un examen d’imagerie',
};

/**
 * Liste des documents, du plus récent au plus ancien (date du document, sinon date d'ajout).
 * Filtres par l'adresse : `?cat=` (catégorie), `?examen=irm|scanner|…` (imagerie), `?specialite=<code>` (urologie, orl…),
 * `?dossier=vitamines|mutuelle|attestation`.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ supprime?: string; cat?: string; examen?: string; specialite?: string; dossier?: string; ajouter?: string }>;
}) {
  const ctx = await appContext();
  const sp = await searchParams;
  const exam = sp.examen && EXAM_LABELS[sp.examen] ? sp.examen : null;
  const folder = exam ? null : folderByCode(sp.dossier);
  const spec = exam || folder ? null : specialtyByCode(sp.specialite);
  // Un type d'examen n'existe que pour l'imagerie.
  const cat = exam ? categoryByKey('imagerie') : folder ? null : categoryByKey(sp.cat);
  const pageTitle = exam ? EXAM_LABELS[exam]! : folder ? folder.title : spec ? spec.title : (cat?.label ?? 'Documents');
  if (ctx.active.kind === 'demo') {
    return (
      <div className="fade-in">
        <PageHeader title={pageTitle} />
        <EmptyState
          title="Pas de documents dans la démonstration"
          description="Choisissez votre profil dans le sélecteur pour ajouter une ordonnance ou un bilan sanguin."
        />
      </div>
    );
  }
  if (!moduleAllowed(ctx.active, 'documents')) return <ModuleForbidden title={pageTitle} profileName={ctx.active.access.displayName} />;
  const canWrite = moduleAllowed(ctx.active, 'documents', 'write');
  const all = await documents().list(ctx.user, ctx.active.access.profileId);
  // Déjà triée par le service : date du document (sinon date d'ajout), la plus récente d'abord.
  const list = all.filter((d) => (!cat || cat.kinds.includes(d.kind)) && (!exam || d.exam_type === exam) && (!spec || d.specialty === spec.code) && (!folder || d.folder === folder.code));
  const subFilter =
    exam || spec || folder
      ? { label: pageTitle, icon: folder?.icon ?? DOC_SHORTCUTS.find((s) => s.key === (exam ?? spec?.code))?.icon ?? (exam ? 'imaging' : 'folder') }
      : null;
  const count = (kinds: string[]) => all.filter((d) => kinds.includes(d.kind)).length;
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
  const fmtDay = (iso: string) => fmt.format(new Date(`${iso}T12:00:00Z`));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  // Couleur de chaque catégorie (la même que sur le tableau de bord) : pastilles, icônes, filtres.
  const CAT_TONE: Record<string, { soft: string; solid: string }> = {
    ordonnances: { soft: 'bg-amber-2 text-amber', solid: 'border-amber bg-amber text-on-accent' },
    analyses: { soft: 'bg-petrol-2 text-petrol', solid: 'border-petrol bg-petrol text-on-accent' },
    imagerie: { soft: 'bg-glucose-2 text-glucose', solid: 'border-glucose bg-glucose text-on-accent' },
    'comptes-rendus': { soft: 'bg-sage-2 text-sage', solid: 'border-sage bg-sage text-on-accent' },
    autres: { soft: 'bg-surface-2 text-ink-2', solid: 'border-ink-2 bg-ink-2 text-surface' },
  };
  const chip = (current: boolean, key?: string) =>
    `flex min-h-11 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full border px-4 text-[15px] font-medium transition-colors ${
      current ? (key && CAT_TONE[key] ? CAT_TONE[key]!.solid : 'border-petrol bg-petrol text-on-accent') : 'border-line bg-surface text-ink hover:bg-surface-2'
    }`;
  // Regroupement par mois (date du document, sinon date d'ajout), du plus récent au plus ancien.
  const monthKey = (d: (typeof list)[number]) => (d.document_date ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d.uploaded_at)).slice(0, 7);
  const groups: { key: string; label: string; items: typeof list }[] = [];
  for (const d of list) {
    const k = monthKey(d);
    let g = groups.find((x) => x.key === k);
    if (!g) {
      g = { key: k, label: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${k}-15T12:00:00Z`)), items: [] };
      groups.push(g);
    }
    g.items.push(d);
  }
  const toReview = list.filter((d) => d.job_status === 'to_review').length;
  const isPrescriptions = cat?.kind === 'prescription';
  const addLabel = exam ? ADD_EXAM[exam]! : folder ? folder.add : spec ? `Ajouter un document ${spec.of}` : isPrescriptions ? 'Ajouter une ordonnance' : 'Ajouter un document';

  return (
    <div className="fade-in">
      <PageHeader title={pageTitle} subtitle={ctx.active.access.displayName} />
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
            defaultExamType={exam ?? undefined}
            defaultSpecialty={spec?.code}
            defaultFolder={folder?.code}
            label={addLabel}
            className="lg:sticky lg:top-4 lg:order-2"
          />
        )}

        <div className="flex min-w-0 flex-col gap-3 lg:order-1">
          <nav aria-label="Catégories de documents" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex snap-x gap-2 pb-1">
              {subFilter && (
                <li>
                  <Link href={exam ? `/documents?cat=imagerie&examen=${exam}` : folder ? `/documents?dossier=${folder.code}` : `/documents?specialite=${spec!.code}`} aria-current="page" className={chip(true)}>
                    <DocIcon name={subFilter.icon} className="size-[18px] shrink-0" />
                    {subFilter.label} <span className="tabular opacity-80">{list.length}</span>
                  </Link>
                </li>
              )}
              <li>
                <Link href="/documents" aria-current={!cat && !subFilter ? 'page' : undefined} className={chip(!cat && !subFilter)}>
                  Tous <span className="tabular opacity-80">{all.length}</span>
                </Link>
              </li>
              {DOC_CATEGORIES.map((c) => (
                <li key={c.key}>
                  <Link
                    href={`/documents?cat=${c.key}`}
                    aria-current={cat?.key === c.key && !subFilter ? 'page' : undefined}
                    className={chip(cat?.key === c.key && !subFilter, c.key)}
                  >
                    <DocIcon name={c.svg} className="size-[18px] shrink-0" />
                    {c.label} <span className="tabular opacity-80">{count(c.kinds)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {list.length === 0 ? (
            <EmptyState
              title={cat || subFilter ? `Aucun document dans « ${pageTitle} ».` : 'Aucun document pour l’instant.'}
              description={canWrite ? 'Photographiez une page ou choisissez un fichier : il sera rangé ici automatiquement.' : undefined}
              action={
                canWrite ? (
                  // Ouvre le formulaire d'ajout (feuille du bas sur téléphone, carte latérale sur ordinateur), déjà présélectionné.
                  <a href="#ajouter" className={buttonClass({ variant: 'secondary' })}>
                    <Icon name="plus" className="size-5" />
                    {addLabel}
                  </a>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Résumé : nombre de documents affichés et lignes en attente de validation. */}
              <section aria-label="Résumé" className="relative overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
                <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(closest-side,rgba(236,72,153,0.16),transparent)]" />
                <div className="relative flex items-center gap-4">
                  <span className="grid size-12 place-items-center rounded-2xl bg-rose-2 text-rose" aria-hidden>
                    <Icon name="folder" className="size-6" />
                  </span>
                  <p className="flex-1">
                    <span className="tabular text-3xl font-bold leading-none">{list.length}</span>{' '}
                    <span className="text-ink-2">{list.length > 1 ? 'documents' : 'document'}</span>
                  </p>
                  {toReview > 0 && (
                    <span className="shrink-0 rounded-full bg-amber-2 px-3 py-1 text-sm font-semibold text-amber">{plural(toReview, 'à valider', 'à valider')}</span>
                  )}
                </div>
              </section>

              <h2 className="sr-only">{cat || subFilter ? `${pageTitle}, du plus récent au plus ancien` : 'Tous les documents, du plus récent au plus ancien'}</h2>
              {groups.map((grp) => (
                <section key={grp.key} aria-label={grp.label}>
                  <h3 className="mb-2 px-1 text-sm font-semibold text-ink-2 first-letter:uppercase">{grp.label}</h3>
                  <ul className="overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]">
                    {grp.items.map((d) => {
                      const st = d.job_status ? STATUS[d.job_status] : null;
                      const c = categoryOf(d.kind);
                      const tone = CAT_TONE[c.key] ?? CAT_TONE.autres!;
                      const isImage = d.mime_type.startsWith('image/');
                      const title = documentTitle(d);
                      const issuer = d.issuer && !/^(dr|pr)\.?\s*[A-Za-zÀ-ÿ]\.?$/i.test(d.issuer.trim()) ? d.issuer : null;
                      return (
                        <li key={d.id} className="flex items-center gap-3 border-b border-line p-3 last:border-b-0">
                          <Link href={`/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-petrol">
                            {isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element -- original déchiffré servi par une route authentifiée
                              <img src={`/api/documents/${d.id}/pages/1`} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl border border-line bg-white object-cover object-top" />
                            ) : (
                              <span className={`grid size-14 shrink-0 place-items-center rounded-xl ${tone.soft}`} aria-hidden>
                                <DocIcon name={c.svg} className="size-6" />
                              </span>
                            )}
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">
                                {title}
                                {d.kind === 'imaging' && d.exam_type && !title.toLowerCase().includes(EXAM_LABELS[d.exam_type]!.toLowerCase()) ? ` · ${EXAM_LABELS[d.exam_type]}` : ''}
                              </span>
                              <span className="block truncate text-sm text-ink-2">
                                {d.document_date ? fmtDay(d.document_date) : `Ajouté le ${fmt.format(d.uploaded_at)}`}
                                {issuer ? ` · ${issuer}` : ''}
                                {d.page_count > 1 ? ` · ${plural(d.page_count, 'page', 'pages')}` : ''}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-1.5">
                                {!cat && !subFilter && <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${tone.soft}`}>{c.single}</span>}
                                {st && (
                                  <Chip tone={st.tone}>{d.job_status === 'to_review' ? `${plural(d.pending, 'ligne', 'lignes')} à valider` : st.label}</Chip>
                                )}
                              </span>
                            </span>
                          </Link>
                          <a
                            href={`/api/documents/${d.id}/pages/1`}
                            target="_blank"
                            rel="noopener"
                            className="grid size-11 shrink-0 place-items-center rounded-full border border-line text-ink-2 transition hover:bg-surface-2 active:scale-95"
                            aria-label={`Ouvrir le fichier : ${title}`}
                            title="Ouvrir l’original en plein écran"
                          >
                            <DocIcon name="eye" className="size-5" />
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
