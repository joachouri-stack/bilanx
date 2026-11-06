import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAnalyte } from '@bilanx/domain';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { documents } from '@/lib/server/auth';
import { deleteDocumentAction, enableAutoReadingAction, reclassifyAsLabReportAction } from '@/lib/server/actions';
import { Button, ButtonLink, Card, CardHeader, Chip, PageHeader, ScrollRegion, buttonClass } from '@/components/ui';
import { Icon } from '@/components/icon';
import { DocumentDetailsForm, ReviewForm } from '@/components/document-forms';
import { categoryOf, documentTitle, EXAM_LABELS } from '@/lib/document-categories';
import { PrescriptionReviewForm } from '@/components/prescription-forms';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Document' };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ valide?: string; traitements?: string; enregistre?: string }> }) {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') notFound();
  if (!moduleAllowed(ctx.active, 'documents')) return <ModuleForbidden title="Document" profileName={ctx.active.access.displayName} />;
  const { id } = await params;
  const sp = await searchParams;
  const view = await documents().get(ctx.user, ctx.active.access.profileId, id);
  if (!view) notFound();
  const { document: doc, job, drafts, medicationDrafts } = view;
  const isPrescription = doc.kind === 'prescription' || medicationDrafts.length > 0;
  const pendingMeds = medicationDrafts.filter((d) => d.status === 'proposed');
  const canValidateMeds = moduleAllowed(ctx.active, 'medications', 'write') && moduleAllowed(ctx.active, 'documents', 'write');
  const consent = await documents().hasAutoReadingConsent(ctx.user.accountId);
  const canValidate = moduleAllowed(ctx.active, 'lab', 'write') && moduleAllowed(ctx.active, 'documents', 'write');
  const pending = drafts.filter((d) => d.status === 'proposed');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const pages = Array.from({ length: doc.page_count }, (_, i) => i + 1);
  const isPdf = doc.mime_type === 'application/pdf';
  const STATUS_FR = { confirmed: 'confirmé', corrected: 'corrigé puis confirmé', rejected: 'ignoré', proposed: 'à valider' } as const;
  const cat = categoryOf(doc.kind);
  // Imagerie, comptes rendus, autres : rangés, jamais lus automatiquement.
  const readable = !doc.kind_by_user || doc.kind === 'prescription' || doc.kind === 'lab_report';
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });

  const writable = moduleAllowed(ctx.active, 'documents', 'write');
  const warningCodes = Array.isArray(job?.warnings) ? (job.warnings as { code?: string }[]).map((w) => w?.code) : [];
  // Rangé comme ordonnance, mais c'est un bilan : le lecteur de bilans y reconnaît des analyses,
  // ou aucune ligne proposée n'a de posologie.
  const looksLikeLab =
    doc.kind === 'prescription' &&
    !!job &&
    // Anciennes lectures (sans nombre d'analyses) : non signalées, elles se trompaient sur « bandelettes de glycémie ».
    ((Array.isArray(job.warnings) && (job.warnings as { code?: string; analytes?: number }[]).some((w) => w.code === 'looks_like_lab_report' && (w.analytes ?? 0) >= 3)) ||
      (pendingMeds.length > 1 && pendingMeds.every((d) => !d.posology.trim())));
  const devicesOnly = warningCodes.includes('medical_devices');
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  const banner = (children: React.ReactNode, href: string, link: string) => (
    <p role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sage-2 px-4 py-3 text-sm">
      <span>{children}</span>
      <Link href={href} className="inline-flex min-h-11 items-center font-medium text-petrol underline">
        {link}
      </Link>
    </p>
  );

  return (
    <div className="fade-in">
      <PageHeader
        title={job?.status === 'to_review' ? (isPrescription ? 'Valider les traitements lus' : 'Valider les valeurs lues') : documentTitle(doc)}
        subtitle={
          job?.status === 'to_review' ? (
            <>
              <strong>{isPrescription ? 'Aucun traitement n’est enregistré' : 'Aucune valeur n’est enregistrée'} avant votre confirmation.</strong> Comparez
              chaque ligne avec le document.
            </>
          ) : (
            [
              cat.single,
              doc.kind === 'imaging' && doc.exam_type ? EXAM_LABELS[doc.exam_type] : null,
              doc.document_date ? `du ${fmtLong.format(new Date(`${doc.document_date}T12:00:00Z`))}` : `ajouté le ${fmtLong.format(doc.uploaded_at)}`,
              doc.issuer,
            ]
              .filter(Boolean)
              .join(' · ')
          )
        }
        actions={
          <Link href={`/documents?cat=${cat.key}`} className={buttonClass({ variant: 'ghost', className: '-ml-3' })}>
            <Icon name="chevronLeft" className="size-5" />
            {cat.label}
          </Link>
        }
      />
      {sp.enregistre && banner(<>Document rangé dans « {cat.label} ».</>, `/documents?cat=${cat.key}`, `Voir ${cat.label.toLowerCase()}`)}
      {sp.traitements !== undefined &&
        banner(
          sp.traitements === '0' ? 'Validation terminée : aucun traitement ajouté.' : `${plural(Number(sp.traitements), 'traitement ajouté', 'traitements ajoutés')} à vos médicaments.`,
          '/medicaments',
          'Voir mes médicaments',
        )}
      {sp.valide !== undefined &&
        banner(
          sp.valide === '0' ? 'Validation terminée : aucune valeur enregistrée.' : `${plural(Number(sp.valide), 'résultat ajouté', 'résultats ajoutés')} à vos analyses.`,
          '/analyses',
          'Voir mes analyses',
        )}
      {looksLikeLab && writable && (
        <section className="mb-4 rounded-2xl border border-amber bg-amber-2 p-4" aria-labelledby="ressemble-bilan">
          <h2 id="ressemble-bilan" className="font-semibold">
            ⚠️ Ce document ressemble à un bilan sanguin, pas à une ordonnance.
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {consent
              ? 'Rangez-le comme bilan : ses analyses seront lues et vous les validerez une par une.'
              : 'Rangez-le comme bilan. La lecture automatique n’est pas autorisée : vous pourrez saisir les résultats à la main.'}
          </p>
          <form action={reclassifyAsLabReportAction} className="mt-3">
            <input type="hidden" name="documentId" value={doc.id} />
            <Button type="submit" variant="primary" className="w-full sm:w-auto">
              Le ranger comme bilan
            </Button>
          </form>
        </section>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="!p-3 sm:!p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-ink-2">
              Document original{doc.page_count > 1 ? ` · ${plural(doc.page_count, 'page', 'pages')}` : ''}
            </h2>
            <a href={`/api/documents/${doc.id}/pages/1`} target="_blank" rel="noopener" className={buttonClass({ variant: 'ghost' })}>
              Ouvrir en plein écran
            </a>
          </div>
          {isPdf ? (
            <iframe src={`/api/documents/${doc.id}/pages/1`} title="Document original" className="h-[45vh] w-full rounded-xl border border-line bg-white lg:h-[70vh]" />
          ) : (
            <>
              {/* Téléphone : aperçu de la première page (pas de zone de défilement imbriquée). */}
              <a href={`/api/documents/${doc.id}/pages/1`} target="_blank" rel="noopener" className="block lg:hidden" aria-label="Ouvrir la première page en plein écran">
                {/* eslint-disable-next-line @next/next/no-img-element -- original déchiffré servi par une route authentifiée */}
                <img src={`/api/documents/${doc.id}/pages/1`} alt="" className="max-h-72 w-full rounded-xl border border-line bg-white object-cover object-top" />
              </a>
              <ScrollRegion label="Pages du document" className="hidden max-h-[75vh] flex-col gap-3 overflow-auto lg:flex">
                {pages.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- original déchiffré servi par une route authentifiée
                  <img key={p} src={`/api/documents/${doc.id}/pages/${p}`} alt={`Page ${p} du document`} className="w-full rounded-xl border border-line bg-white" />
                ))}
              </ScrollRegion>
            </>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          {!job && readable && (
            <Card>
              {consent ? (
                <p className="text-ink-2">Ce document n’a pas encore été lu.</p>
              ) : (
                <>
                  <CardHeader title="Lecture automatique désactivée" />
                  <p className="text-sm text-ink-2">
                    Le document est conservé. Vous pouvez saisir les résultats à la main, ou autoriser la lecture automatique : les valeurs
                    trouvées vous seront proposées, et rien ne sera enregistré sans votre confirmation.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                    <form action={enableAutoReadingAction}>
                      <input type="hidden" name="documentId" value={doc.id} />
                      <Button type="submit" variant="primary" className="w-full sm:w-auto">
                        Autoriser la lecture automatique
                      </Button>
                    </form>
                    <ButtonLink href="/analyses/ajouter">Saisir à la main</ButtonLink>
                  </div>
                </>
              )}
            </Card>
          )}
          {job?.status === 'failed' && (
            <Card>
              <CardHeader title="Lecture impossible" />
              <p className="text-sm text-ink-2">Le texte de ce document n’a pas pu être lu. Saisissez les résultats à la main.</p>
            </Card>
          )}
          {job && job.status !== 'failed' && drafts.length === 0 && !isPrescription && (
            <Card>
              <CardHeader title="Aucun résultat d’analyse trouvé" />
              <p className="text-sm text-ink-2">
                {Array.isArray(job.warnings) && job.warnings.length
                  ? 'Ce PDF semble scanné (sans texte). Ajoutez plutôt une photo de chaque page, ou saisissez les résultats à la main.'
                  : 'Le document ne ressemble pas à un bilan sanguin reconnu. Vous pouvez saisir les résultats à la main.'}
              </p>
            </Card>
          )}
          {job && job.status !== 'failed' && isPrescription && medicationDrafts.length === 0 && drafts.length === 0 && (
            <Card>
              <CardHeader title={devicesOnly ? 'Ordonnance de matériel' : 'Aucun médicament trouvé'} />
              <p className="text-sm text-ink-2">
                {devicesOnly
                  ? 'Cette ordonnance concerne du matériel (capteurs, bandelettes…) : il n’y a rien à ajouter à vos médicaments. Elle est bien rangée dans vos ordonnances.'
                  : 'Aucune ligne de cette ordonnance ne ressemble à un médicament. Vous pouvez ajouter vos médicaments à la main.'}
              </p>
              <div className="mt-3">
                <ButtonLink href="/medicaments">Mes médicaments</ButtonLink>
              </div>
            </Card>
          )}
          {job?.status === 'to_review' && pending.length > 0 && (
            <Card className="!p-3 sm:!p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip tone="amber">{plural(pending.length, 'ligne détectée', 'lignes détectées')}</Chip>
                <Chip tone="neutral">{job.method === 'ocr' ? 'Lecture de la photo' : 'Texte du PDF'}</Chip>
              </div>
              {canValidate ? (
                <ReviewForm
                  documentId={doc.id}
                  today={today}
                  sampledOn={job.detected_sampling_date}
                  laboratory={job.detected_lab}
                  drafts={pending.map((d) => ({ id: d.id, rawLabel: d.rawLabel, rawValue: d.rawValue, rawUnit: d.rawUnit, analyteCode: d.analyteCode, refLow: d.refLow, refHigh: d.refHigh, page: d.page, lineText: d.lineText, checks: d.checks }))}
                />
              ) : (
                <p className="text-sm text-ink-2">Vous pouvez consulter ce document, mais pas ajouter de résultats d’analyses à ce profil.</p>
              )}
            </Card>
          )}
          {job?.status === 'to_review' && pendingMeds.length > 0 && (
            <Card className="!p-3 sm:!p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip tone="amber">Ordonnance · {plural(pendingMeds.length, 'traitement lu', 'traitements lus')}</Chip>
                <Chip tone="neutral">{job.method === 'ocr' ? 'Lecture de la photo' : 'Texte du PDF'}</Chip>
              </div>
              {canValidateMeds ? (
                <PrescriptionReviewForm
                  documentId={doc.id}
                  prescriber={doc.issuer}
                  drafts={pendingMeds.map((d) => ({ id: d.id, lineText: d.lineText, page: d.page, name: d.name, strength: d.strength, posology: d.posology, times: d.times, qty: d.qty, startDate: d.startDate, endDate: d.endDate, checks: d.checks }))}
                />
              ) : (
                <p className="text-sm text-ink-2">Vous pouvez consulter cette ordonnance, mais pas ajouter de traitements à ce profil.</p>
              )}
            </Card>
          )}
          {job?.status === 'reviewed' && medicationDrafts.length > 0 && (
            <Card>
              <CardHeader title="Traitements lus et décisions" />
              <ul className="divide-y divide-line">
                {medicationDrafts.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      {d.name}
                      {d.strength ? ` ${d.strength}` : ''}
                    </span>
                    <Chip tone={d.status === 'rejected' ? 'neutral' : 'sage'}>{d.status === 'rejected' ? 'ignoré' : d.status === 'corrected' ? 'corrigé puis ajouté' : 'ajouté'}</Chip>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {job?.status === 'reviewed' && drafts.length > 0 && (
            <Card>
              <CardHeader title="Valeurs lues et décisions" />
              <ul className="divide-y divide-line">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      {(d.analyteCode && getAnalyte(d.analyteCode)?.nameFr) || d.rawLabel}
                      <span className="block text-sm text-ink-3">
                        lu « {d.rawValue} {d.rawUnit ?? ''} »
                      </span>
                    </span>
                    <Chip tone={d.status === 'rejected' ? 'neutral' : 'sage'}>{STATUS_FR[d.status]}</Chip>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {writable && (
            <Card>
              <details open={!doc.kind_by_user && !job} className="group">
                <summary className="-m-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl p-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  <span className="text-[17px] font-semibold">Classement : {cat.label}</span>
                  <Icon name="chevronDown" className="size-5 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mb-3 mt-3 text-sm text-ink-2">Catégorie, date et titre, pour retrouver ce document en un instant.</p>
                <DocumentDetailsForm
                  documentId={doc.id}
                  today={today}
                  kind={doc.kind}
                  title={doc.title && !/\.(pdf|jpe?g|png|webp|heic)$/i.test(doc.title) ? doc.title : ''}
                  date={doc.document_date}
                  examType={doc.exam_type}
                  issuer={doc.issuer}
                />
              </details>
            </Card>
          )}
          {writable && (
            <details className="group">
              <summary className={buttonClass({ variant: 'danger', className: 'w-full cursor-pointer list-none sm:w-auto [&::-webkit-details-marker]:hidden' })}>Supprimer ce document</summary>
              <form action={deleteDocumentAction} className="mt-3 flex flex-col gap-3 rounded-2xl border border-red bg-red-2 p-4">
                <input type="hidden" name="documentId" value={doc.id} />
                <p className="text-sm text-ink">L’original sera effacé. Les résultats déjà validés resteront dans vos analyses.</p>
                <Button type="submit" variant="danger" className="w-full sm:w-auto">
                  Confirmer la suppression
                </Button>
              </form>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
