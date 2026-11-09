import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { documents } from '@/lib/server/auth';
import { Chip, EmptyState, PageHeader, buttonClass } from '@/components/ui';
import { TONES, type ToneName } from '@/lib/tones';
import { Icon } from '@/components/icon';
import { DocumentsAdd } from '@/components/documents-add';
import { DocIcon } from '@/components/documents-icons';
import { ModuleForbidden } from '@/components/module-forbidden';
import {
  DOC_CATEGORIES,
  EXAM_LABELS,
  FOLDERS,
  PINNED_SPECIALTIES,
  SPECIALTIES,
  categoryByKey,
  categoryOf,
  documentTitle,
  folderByCode,
  specialtyByCode,
  type DocCategoryIcon,
} from '@/lib/document-categories';

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

// Couleur de chaque type (la même que sur le tableau de bord) ; les spécialités sont en rose (couleur des Documents).
const CAT_TONE: Record<string, { soft: string; solid: string }> = {
  ordonnances: { soft: 'bg-amber-2 text-amber', solid: 'border-amber bg-amber text-on-accent' },
  analyses: { soft: 'bg-petrol-2 text-petrol', solid: 'border-petrol bg-petrol text-on-accent' },
  imagerie: { soft: 'bg-glucose-2 text-glucose', solid: 'border-glucose bg-glucose text-on-accent' },
  'comptes-rendus': { soft: 'bg-sage-2 text-sage', solid: 'border-sage bg-sage text-on-accent' },
  autres: { soft: 'bg-surface-2 text-ink-2', solid: 'border-ink-2 bg-ink-2 text-surface' },
};
/** « 2 ordonnances · 1 imagerie » (contenu d'un dossier de spécialité). */
const KIND_WORDS: Record<string, [string, string]> = {
  ordonnances: ['ordonnance', 'ordonnances'],
  analyses: ['bilan', 'bilans'],
  imagerie: ['imagerie', 'imageries'],
  'comptes-rendus': ['compte rendu', 'comptes rendus'],
  autres: ['autre', 'autres'],
};
const FOLDER_TONE: Record<string, string> = { mutuelle: 'bg-petrol-2 text-petrol', attestation: 'bg-surface-2 text-ink-2' };

/** Pastille de sous-dossier (filtre dans un dossier). */
function SubChip({ href, current, label, count, icon }: { href: string; current: boolean; label: string; count: number; icon?: DocCategoryIcon }) {
  return (
    <li>
      <Link
        href={href}
        aria-current={current ? 'page' : undefined}
        className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[15px] font-medium transition-colors ${
          current ? 'bg-ink text-surface' : 'border border-line bg-surface text-ink-2 hover:text-ink'
        }`}
      >
        {icon && <DocIcon name={icon} className="size-[18px] shrink-0" />}
        {label} <span className="tabular opacity-80">{count}</span>
      </Link>
    </li>
  );
}

/** Grande carte de dossier (accueil) : couleur du dossier, nombre de documents, contenu par type. */
function FolderCard({ href, icon, tone, label, count, sub }: { href: string; icon: DocCategoryIcon; tone: ToneName; label: string; count: number; sub?: string }) {
  const t = TONES[tone];
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="group relative flex h-full min-h-32 flex-col overflow-hidden rounded-[20px] border border-line bg-surface p-4 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-petrol"
      >
        <span aria-hidden className={`pointer-events-none absolute -right-10 -top-12 size-32 rounded-full blur-2xl transition-opacity group-hover:opacity-100 ${t.glow} opacity-70`} />
        <span className={`relative grid size-12 place-items-center rounded-2xl ${t.soft}`} aria-hidden>
          <DocIcon name={icon} className="size-6" />
        </span>
        <span className="relative mt-auto block pt-3 text-[17px] font-semibold leading-tight">{label}</span>
        <span className="relative mt-0.5 block truncate text-[13px] text-ink-3">{sub ?? plural(count, 'document', 'documents')}</span>
        <span aria-hidden className={`tabular absolute right-4 top-3.5 text-[28px] font-bold leading-none ${t.text}`}>
          {count}
        </span>
      </Link>
    </li>
  );
}

/** Petite tuile (types de document, administratif, sous-dossiers). */
function TypeTile({ href, icon, tone, label, count }: { href: string; icon: DocCategoryIcon; tone: string; label: string; count: number }) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className={`flex h-full min-h-[60px] items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 transition hover:bg-surface-2 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-petrol`}
      >
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tone}`} aria-hidden>
          <DocIcon name={icon} className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold leading-tight">{label}</span>
          <span className="block text-[13px] text-ink-3">{count ? plural(count, 'document', 'documents') : 'Vide'}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * Documents rangés selon deux axes : le TYPE (ordonnance, bilan, imagerie, compte rendu) et la SPÉCIALITÉ (yeux, diabète…).
 * Une ordonnance de l'ophtalmo est dans « Ordonnances » et dans « Yeux », sans être dupliquée.
 * - `/documents` : les dossiers (par type, par spécialité, administratif) et les derniers ajouts ; `?tout=1` : tout.
 * - `?cat=<type>` : dossier d'un type ; sous-dossiers par spécialité (`&specialite=<code>|aucune`) ; imagerie : `&examen=irm…`.
 * - `?specialite=<code>` : dossier d'une spécialité ; sous-dossiers par type (`&type=<type>`).
 * - `?dossier=mutuelle|attestation` : dossiers administratifs.
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ supprime?: string; cat?: string; type?: string; examen?: string; specialite?: string; dossier?: string; tout?: string }>;
}) {
  const ctx = await appContext();
  const sp = await searchParams;
  // Ancien dossier administratif « Vitamines » : c'est désormais un dossier thématique.
  if (sp.dossier === 'vitamines') redirect('/documents?specialite=vitamines');
  const folder = folderByCode(sp.dossier);
  const exam = !folder && sp.examen && EXAM_LABELS[sp.examen] ? sp.examen : null;
  // Racine : un type (?cat=, ou un examen d'imagerie seul), sinon une spécialité, sinon un dossier administratif.
  const typeRoot = folder ? null : (categoryByKey(sp.cat) ?? (exam ? categoryByKey('imagerie') : null));
  const specParam = folder ? null : sp.specialite === 'aucune' ? 'aucune' : (specialtyByCode(sp.specialite)?.code ?? null);
  const specRoot = !typeRoot && specParam && specParam !== 'aucune' ? specialtyByCode(specParam)! : null;
  const subType = specRoot ? categoryByKey(sp.type) : null;
  const subSpec = typeRoot ? specParam : null;
  const isHome = !typeRoot && !specRoot && !folder;
  const showAll = isHome && sp.tout === '1';

  const rootTitle = typeRoot ? typeRoot.label : specRoot ? specRoot.short : folder ? folder.title : showAll ? 'Tous les documents' : 'Documents';
  const subTitle = exam
    ? EXAM_LABELS[exam]!
    : subSpec === 'aucune'
      ? 'Sans spécialité'
      : subSpec
        ? specialtyByCode(subSpec)!.short
        : subType
          ? subType.label
          : null;
  const pageTitle = subTitle ?? rootTitle;

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
  type Doc = (typeof all)[number];

  // Documents du dossier racine (avant sous-filtre) puis liste affichée.
  const inRoot = all.filter(
    (d) => (!typeRoot || typeRoot.kinds.includes(d.kind)) && (!specRoot || d.specialty === specRoot.code) && (!folder || d.folder === folder.code),
  );
  const list = inRoot.filter(
    (d) =>
      (!exam || d.exam_type === exam) &&
      (!subSpec || (subSpec === 'aucune' ? !d.specialty : d.specialty === subSpec)) &&
      (!subType || subType.kinds.includes(d.kind)),
  );
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });
  const fmtDay = (iso: string) => fmt.format(new Date(`${iso}T12:00:00Z`));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

  // Accueil : les derniers ajouts seulement (la liste complète est à un appui).
  const RECENT = 6;
  const shown = isHome && !showAll ? list.slice(0, RECENT) : list;
  // Regroupement par mois (date du document, sinon date d'ajout), du plus récent au plus ancien.
  const monthKey = (d: Doc) => (d.document_date ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(d.uploaded_at)).slice(0, 7);
  const groups: { key: string; label: string; items: Doc[] }[] = [];
  for (const d of shown) {
    const k = monthKey(d);
    let g = groups.find((x) => x.key === k);
    if (!g) {
      g = { key: k, label: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${k}-15T12:00:00Z`)), items: [] };
      groups.push(g);
    }
    g.items.push(d);
  }
  const toReview = list.filter((d) => d.job_status === 'to_review').length;

  // Formulaire d'ajout présélectionné selon le dossier ouvert.
  const addCat = typeRoot ?? subType;
  const addSpec = specRoot?.code ?? (subSpec && subSpec !== 'aucune' ? subSpec : undefined);
  const addLabel = exam
    ? ADD_EXAM[exam]!
    : folder
      ? folder.add
      : addCat?.kind === 'prescription'
        ? 'Ajouter une ordonnance'
        : addSpec
          ? `Ajouter un document · ${specialtyByCode(addSpec)!.short}`
          : 'Ajouter un document';

  // Icône de l'en-tête : celle du dossier (ou du sous-dossier) ouvert.
  const headSpec = specRoot ?? (subSpec && subSpec !== 'aucune' ? specialtyByCode(subSpec) : null);
  const headCat = subType ?? (typeRoot && !subSpec ? typeRoot : null);
  const headIcon: { icon: DocCategoryIcon; tone: string } | null = exam
    ? { icon: 'imaging', tone: CAT_TONE.imagerie!.soft }
    : headCat
      ? { icon: headCat.svg, tone: CAT_TONE[headCat.key]!.soft }
      : headSpec
        ? { icon: headSpec.icon, tone: TONES[headSpec.tone].soft }
        : folder
          ? { icon: folder.icon, tone: FOLDER_TONE[folder.code]! }
          : null;

  // Fil d'Ariane : Documents › Yeux › Ordonnances.
  const rootHref = typeRoot ? `/documents?cat=${typeRoot.key}` : specRoot ? `/documents?specialite=${specRoot.code}` : folder ? `/documents?dossier=${folder.code}` : '/documents';
  const crumbs: { href: string; label: string }[] = isHome && !showAll ? [] : [{ href: '/documents', label: 'Documents' }];
  if (subTitle) crumbs.push({ href: rootHref, label: rootTitle });

  // Sous-dossiers du dossier ouvert.
  const subChips: { key: string; href: string; label: string; count: number; current: boolean; icon?: DocCategoryIcon }[] = [];
  if (typeRoot) {
    const base = `/documents?cat=${typeRoot.key}`;
    subChips.push({ key: 'tout', href: base, label: 'Tout', count: inRoot.length, current: !subSpec && !exam });
    for (const s of SPECIALTIES) {
      const n = inRoot.filter((d) => d.specialty === s.code).length;
      if (n || subSpec === s.code) subChips.push({ key: s.code, href: `${base}&specialite=${s.code}`, label: s.short, count: n, current: subSpec === s.code, icon: s.icon });
    }
    const none = inRoot.filter((d) => !d.specialty).length;
    if (subChips.length > 1 && (none || subSpec === 'aucune'))
      subChips.push({ key: 'aucune', href: `${base}&specialite=aucune`, label: 'Sans spécialité', count: none, current: subSpec === 'aucune' });
  } else if (specRoot) {
    const base = `/documents?specialite=${specRoot.code}`;
    subChips.push({ key: 'tout', href: base, label: 'Tout', count: inRoot.length, current: !subType });
    for (const c of DOC_CATEGORIES) {
      const n = inRoot.filter((d) => c.kinds.includes(d.kind)).length;
      if (n || subType?.key === c.key) subChips.push({ key: c.key, href: `${base}&type=${c.key}`, label: c.label, count: n, current: subType?.key === c.key, icon: c.svg });
    }
  }

  // Accueil : dossiers par type, par spécialité, administratifs.
  const byKind = (kinds: string[]) => all.filter((d) => kinds.includes(d.kind)).length;
  const specTiles = SPECIALTIES.map((s) => {
    const docs = all.filter((d) => d.specialty === s.code);
    const parts = DOC_CATEGORIES.map((c) => ({ c, n: docs.filter((d) => c.kinds.includes(d.kind)).length })).filter((x) => x.n);
    return { s, n: docs.length, sub: parts.length ? parts.map((x) => plural(x.n, ...KIND_WORDS[x.c.key]!)).join(' · ') : undefined };
  })
    .filter((t) => t.n || PINNED_SPECIALTIES.includes(t.s.code))
    .sort((a, b) => b.n - a.n || PINNED_SPECIALTIES.indexOf(a.s.code) - PINNED_SPECIALTIES.indexOf(b.s.code));
  const filledSpecs = specTiles.filter((t) => t.n);
  const emptySpecs = specTiles.filter((t) => !t.n);
  const newest = all.reduce<Date | null>((m, d) => (!m || d.uploaded_at > m ? d.uploaded_at : m), null);
  const lastAdded = newest
    ? (() => {
        const days = Math.floor((Date.now() - newest.getTime()) / 86_400_000);
        return days <= 0 ? 'aujourd’hui' : days === 1 ? 'hier' : days < 7 ? `il y a ${days} jours` : `le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(newest)}`;
      })()
    : null;

  const rowList = (
    <>
      {groups.map((grp) => (
        <section key={grp.key} aria-label={grp.label}>
          <h3 className="mb-2 px-1 text-sm font-semibold text-ink-2 first-letter:uppercase">{grp.label}</h3>
          <ul className="overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]">
            {grp.items.map((d) => {
              const st = d.job_status ? STATUS[d.job_status] : null;
              const c = categoryOf(d.kind);
              const tone = CAT_TONE[c.key] ?? CAT_TONE.autres!;
              const sp = specialtyByCode(d.specialty);
              const fo = folderByCode(d.folder);
              const isImage = d.mime_type.startsWith('image/');
              const title = documentTitle(d);
              const issuer = d.issuer && !/^(dr|pr)\.?\s*[A-Za-zÀ-ÿ]\.?$/i.test(d.issuer.trim()) ? d.issuer : null;
              // Étiquettes : le type et la spécialité, sauf ce que le dossier ouvert dit déjà.
              const showType = !typeRoot && !subType && !fo;
              const showSpec = !!sp && !specRoot && !(subSpec && subSpec !== 'aucune');
              return (
                <li key={d.id} className="flex items-center gap-3 border-b border-line p-3 last:border-b-0">
                  <Link href={`/documents/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-petrol">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element -- original déchiffré servi par une route authentifiée
                      <img src={`/api/documents/${d.id}/pages/1`} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl border border-line bg-white object-cover object-top" />
                    ) : (
                      <span className={`grid size-14 shrink-0 place-items-center rounded-xl ${fo ? FOLDER_TONE[fo.code] : tone.soft}`} aria-hidden>
                        <DocIcon name={fo?.icon ?? c.svg} className="size-6" />
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
                      {(showType || showSpec || (fo && !folder) || st) && (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {showType && <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${tone.soft}`}>{c.single}</span>}
                          {fo && !folder && <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${FOLDER_TONE[fo.code]}`}>{fo.title}</span>}
                          {showSpec && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${TONES[sp!.tone].soft}`}>
                              <DocIcon name={sp!.icon} className="size-3.5" />
                              {sp!.short}
                            </span>
                          )}
                          {st && <Chip tone={st.tone}>{d.job_status === 'to_review' ? `${plural(d.pending, 'ligne', 'lignes')} à valider` : st.label}</Chip>}
                        </span>
                      )}
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
  );

  return (
    <div className="fade-in">
      {crumbs.length > 0 && (
        <nav aria-label="Fil d’Ariane" className="-mb-3 mt-1">
          <ol className="flex flex-wrap items-center gap-1 text-[15px] text-ink-2">
            {crumbs.map((c, i) => (
              <li key={c.href} className="flex items-center gap-1">
                {i === 0 && <Icon name="chevronLeft" className="size-4 text-petrol" />}
                {i > 0 && <span aria-hidden>›</span>}
                <Link href={c.href} className="inline-flex min-h-11 items-center font-medium text-petrol">
                  {c.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      )}
      {headIcon ? (
        // Dossier ouvert : grande icône à sa couleur, nom et contenu.
        <header className="mb-5 flex items-center gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl shadow-[var(--shadow-card)] ${headIcon.tone}`} aria-hidden>
            <DocIcon name={headIcon.icon} className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-semibold leading-tight sm:text-[32px]">{pageTitle}</h1>
            <p className="mt-0.5 text-ink-2">
              {plural(list.length, 'document', 'documents')} · {ctx.active.access.displayName}
            </p>
          </div>
        </header>
      ) : (
        <PageHeader title={pageTitle} subtitle={ctx.active.access.displayName} />
      )}
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Document supprimé. Les résultats déjà validés restent dans vos analyses.
        </p>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        {canWrite && (
          <DocumentsAdd
            today={today}
            defaultKind={addCat?.kind ?? (folder ? 'other' : '')}
            defaultExamType={exam ?? undefined}
            defaultSpecialty={addSpec}
            defaultFolder={folder?.code}
            label={addLabel}
            className="lg:sticky lg:top-4 lg:order-2"
          />
        )}

        <div className="flex min-w-0 flex-col gap-4 lg:order-1">
          {isHome && !showAll && (
            <>
              {/* Bandeau : l'essentiel en un coup d'œil. */}
              <section
                aria-label="Résumé de vos documents"
                className="relative overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,var(--rose),var(--violet))] p-5 text-on-accent shadow-[var(--shadow-card)]"
              >
                <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 size-48 rounded-full bg-on-accent/10" />
                <span aria-hidden className="pointer-events-none absolute -right-2 -top-8 size-28 rounded-full bg-on-accent/10" />
                <div className="relative flex items-end justify-between gap-4">
                  <div>
                    <p className="tabular text-[40px] font-bold leading-none">{all.length}</p>
                    <p className="mt-1 font-medium">{all.length > 1 ? 'documents rangés' : 'document rangé'}</p>
                    <p className="mt-0.5 text-sm opacity-90">
                      {filledSpecs.length ? `dans ${plural(filledSpecs.length, 'dossier', 'dossiers')}` : 'Rangez-les par dossier : Yeux, Diabète…'}
                      {lastAdded ? ` · dernier ajout ${lastAdded}` : ''}
                    </p>
                  </div>
                  <Icon name="folder" className="relative size-14 shrink-0 opacity-30" strokeWidth={1.4} />
                </div>
                {toReview > 0 && (
                  <p className="relative mt-3 inline-flex items-center gap-1.5 rounded-full bg-on-accent/20 px-3 py-1 text-sm font-semibold">
                    {toReview} à valider
                  </p>
                )}
              </section>

              <section aria-labelledby="par-specialite">
                <h2 id="par-specialite" className="mb-2.5 px-1 text-[15px] font-semibold">
                  Mes dossiers
                </h2>
                {filledSpecs.length > 0 && (
                  <ul className="grid grid-cols-2 gap-2.5 xl:grid-cols-3">
                    {filledSpecs.map(({ s, n, sub }) => (
                      <FolderCard key={s.code} href={`/documents?specialite=${s.code}`} icon={s.icon} tone={s.tone} label={s.short} count={n} sub={sub} />
                    ))}
                  </ul>
                )}
                {emptySpecs.length > 0 && (
                  <ul className={`flex flex-wrap gap-2 ${filledSpecs.length ? 'mt-3' : ''}`} aria-label="Dossiers encore vides">
                    {emptySpecs.map(({ s }) => (
                      <li key={s.code}>
                        <Link
                          href={`/documents?specialite=${s.code}`}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-line bg-surface px-3.5 text-[15px] font-medium text-ink-2 transition hover:text-ink"
                        >
                          <span className={`grid size-6 place-items-center rounded-full ${TONES[s.tone].soft}`} aria-hidden>
                            <DocIcon name={s.icon} className="size-3.5" />
                          </span>
                          {s.short}
                          <span className="sr-only">(vide)</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-labelledby="par-type">
                <h2 id="par-type" className="mb-2.5 px-1 text-[15px] font-semibold">
                  Par type
                </h2>
                <ul className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
                  {DOC_CATEGORIES.filter((c) => c.key !== 'autres' || byKind(c.kinds)).map((c) => (
                    <TypeTile key={c.key} href={`/documents?cat=${c.key}`} icon={c.svg} tone={CAT_TONE[c.key]!.soft} label={c.label} count={byKind(c.kinds)} />
                  ))}
                </ul>
              </section>

              <section aria-labelledby="administratif">
                <h2 id="administratif" className="mb-2.5 px-1 text-[15px] font-semibold">
                  Administratif
                </h2>
                <ul className="grid grid-cols-2 gap-2 2xl:grid-cols-3">
                  {FOLDERS.map((f) => (
                    <TypeTile
                      key={f.code}
                      href={`/documents?dossier=${f.code}`}
                      icon={f.icon}
                      tone={FOLDER_TONE[f.code]!}
                      label={f.title}
                      count={all.filter((d) => d.folder === f.code).length}
                    />
                  ))}
                </ul>
              </section>
            </>
          )}

          {/* Dossier thématique (Yeux, Diabète…) : ses sous-dossiers par type, toujours affichés. */}
          {specRoot && !subType && (
            <section aria-labelledby="sous-dossiers">
              <h2 id="sous-dossiers" className="mb-2 px-1 text-sm font-semibold text-ink-2">
                Sous-dossiers
              </h2>
              <ul className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
                {DOC_CATEGORIES.filter((c) => c.key !== 'autres' || inRoot.some((d) => c.kinds.includes(d.kind))).map((c) => (
                  <TypeTile
                    key={c.key}
                    href={`/documents?specialite=${specRoot.code}&type=${c.key}`}
                    icon={c.svg}
                    tone={CAT_TONE[c.key]!.soft}
                    label={c.label}
                    count={inRoot.filter((d) => c.kinds.includes(d.kind)).length}
                  />
                ))}
              </ul>
            </section>
          )}

          {subChips.length > 1 && !(specRoot && !subType) && (
            <nav aria-label={typeRoot ? 'Spécialités' : 'Types de document'} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ul className="flex gap-2 pb-1">
                {subChips.map(({ key, ...c }) => (
                  <SubChip key={key} {...c} />
                ))}
              </ul>
            </nav>
          )}

          {/* Imagerie : sous-dossiers par type d'examen (IRM, scanner, radio, échographie). */}
          {typeRoot?.key === 'imagerie' && (
            <nav aria-label="Type d’examen" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ul className="flex gap-2 pb-1">
                {[['', 'Tous les examens'] as const, ...Object.entries(EXAM_LABELS)].map(([k, l]) => {
                  const n = inRoot.filter((d) => (!subSpec || (subSpec === 'aucune' ? !d.specialty : d.specialty === subSpec)) && (!k || d.exam_type === k)).length;
                  if (k && !n && exam !== k) return null;
                  const current = (exam ?? '') === k;
                  const q = subSpec ? `&specialite=${subSpec}` : '';
                  return (
                    <li key={k || 'tous'}>
                      <Link
                        href={k ? `/documents?cat=imagerie${q}&examen=${k}` : `/documents?cat=imagerie${q}`}
                        aria-current={current ? 'page' : undefined}
                        className={`flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors ${
                          current ? 'bg-glucose-2 text-glucose ring-1 ring-glucose' : 'bg-surface-2 text-ink-2 hover:text-ink'
                        }`}
                      >
                        {l} <span className="tabular opacity-80">{n}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {list.length === 0 ? (
            <EmptyState
              title={isHome ? 'Aucun document pour l’instant.' : `Aucun document dans « ${pageTitle} ».`}
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
          ) : isHome && !showAll ? (
            <section aria-labelledby="derniers" className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between px-1">
                <h2 id="derniers" className="text-sm font-semibold text-ink-2">
                  Derniers ajouts
                </h2>
                {toReview > 0 && <span className="rounded-full bg-amber-2 px-3 py-1 text-sm font-semibold text-amber">{toReview} à valider</span>}
              </div>
              {rowList}
              {list.length > RECENT && (
                <Link href="/documents?tout=1" className={buttonClass({ variant: 'secondary', className: 'w-full' })}>
                  Voir les {list.length} documents
                </Link>
              )}
            </section>
          ) : (
            <>
              {/* Résumé : nombre de documents affichés et lignes en attente de validation. */}
              <section aria-label="Résumé" className="flex items-center gap-3 px-1">
                <p className="flex-1 text-ink-2">
                  <span className="tabular text-xl font-bold text-ink">{list.length}</span> {list.length > 1 ? 'documents' : 'document'}
                  {specRoot && !subType ? ' · tous types' : ''}
                </p>
                {toReview > 0 && <span className="shrink-0 rounded-full bg-amber-2 px-3 py-1 text-sm font-semibold text-amber">{toReview} à valider</span>}
              </section>
              <h2 className="sr-only">{`${pageTitle}, du plus récent au plus ancien`}</h2>
              {rowList}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
