import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAnalyte } from '@bilanx/domain';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { documents } from '@/lib/server/auth';
import { deleteDocumentAction, enableAutoReadingAction } from '@/lib/server/actions';
import { ButtonLink, Card, Chip, Meta, PageHeader, ScrollRegion } from '@/components/ui';
import { ReviewForm } from '@/components/document-forms';
import { PrescriptionReviewForm } from '@/components/prescription-forms';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Document' };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ valide?: string; traitements?: string }> }) {
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

  return (
    <div className="fade-in">
      <PageHeader
        title={
          job?.status === 'to_review'
            ? isPrescription
              ? 'Valider les traitements lus'
              : 'Valider les valeurs lues'
            : doc.kind === 'lab_report'
              ? 'Bilan biologique'
              : isPrescription
                ? 'Ordonnance'
                : doc.title
        }
        subtitle={
          job?.status === 'to_review' ? (
            <>
              <strong>{isPrescription ? 'Aucun traitement n’est enregistré' : 'Aucune valeur n’est enregistrée'} avant votre confirmation.</strong> Comparez
              chaque ligne avec le document.
            </>
          ) : (
            `Déposé le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(doc.uploaded_at)}`
          )
        }
        actions={
          <Link href="/documents" className="text-sm text-ink-3 hover:text-ink">
            ← Documents
          </Link>
        }
      />
      {sp.traitements !== undefined && (
        <p role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          {sp.traitements === '0' ? 'Validation terminée : aucun traitement ajouté.' : `${sp.traitements} traitement(s) ajouté(s) à vos médicaments.`}
          <Link href="/medicaments" className="font-medium text-petrol underline">
            Voir mes médicaments
          </Link>
        </p>
      )}
      {sp.valide !== undefined && (
        <p role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          {sp.valide === '0' ? 'Validation terminée : aucune valeur enregistrée.' : `${sp.valide} résultat(s) ajouté(s) à vos analyses.`}
          <Link href="/analyses" className="font-medium text-petrol underline">
            Voir mes analyses
          </Link>
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card className="min-h-[300px]">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-ink-3">Document original</p>
            <a href={`/api/documents/${doc.id}/pages/1`} target="_blank" rel="noopener" className="text-xs text-petrol underline">
              Ouvrir dans un nouvel onglet
            </a>
          </div>
          {isPdf ? (
            <iframe src={`/api/documents/${doc.id}/pages/1`} title="Document original" className="h-[70vh] w-full rounded-xl border border-line bg-white" />
          ) : (
            <ScrollRegion label="Pages du document" className="flex max-h-[75vh] flex-col gap-3 overflow-auto">
              {pages.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element -- original déchiffré servi par une route authentifiée
                <img key={p} src={`/api/documents/${doc.id}/pages/${p}`} alt={`Page ${p} du document`} className="w-full rounded-xl border border-line bg-white" />
              ))}
            </ScrollRegion>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {!job && (
            <Card>
              {consent ? (
                <p className="text-sm text-ink-2">Ce document n’a pas encore été lu.</p>
              ) : (
                <>
                  <h2 className="font-semibold">Lecture automatique désactivée</h2>
                  <p className="mt-1 text-sm text-ink-2">
                    Vous n’avez pas autorisé la lecture automatique des documents. Le document est conservé ; vous pouvez saisir les
                    résultats à la main, ou autoriser la lecture : les valeurs détectées vous seront proposées, aucune ne sera
                    enregistrée sans votre confirmation.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={enableAutoReadingAction}>
                      <input type="hidden" name="documentId" value={doc.id} />
                      <button type="submit" className="min-h-11 rounded-xl bg-petrol px-4 font-medium text-on-accent">
                        Autoriser la lecture automatique
                      </button>
                    </form>
                    <ButtonLink href="/analyses/ajouter">Saisir à la main</ButtonLink>
                  </div>
                </>
              )}
            </Card>
          )}
          {job?.status === 'failed' && (
            <Card>
              <p className="font-semibold">Lecture impossible</p>
              <p className="mt-1 text-sm text-ink-2">Le texte de ce document n’a pas pu être lu. Saisissez les résultats à la main.</p>
            </Card>
          )}
          {job && job.status !== 'failed' && drafts.length === 0 && !isPrescription && (
            <Card>
              <p className="font-semibold">Aucun résultat d’analyse détecté</p>
              <p className="mt-1 text-sm text-ink-2">
                {Array.isArray(job.warnings) && job.warnings.length
                  ? 'Ce PDF semble scanné (sans texte) : sa lecture n’est pas encore disponible. Déposez plutôt une photo de chaque page, ou saisissez les résultats à la main.'
                  : 'Le document ne ressemble pas à un compte rendu de laboratoire reconnu. Vous pouvez saisir les résultats à la main.'}
              </p>
            </Card>
          )}
          {job?.status === 'to_review' && pending.length > 0 && (
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip tone="amber">{pending.length} ligne(s) détectée(s)</Chip>
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
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip tone="amber">Ordonnance · {pendingMeds.length} traitement(s) lu(s)</Chip>
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
              <h2 className="font-semibold">Traitements lus et décisions</h2>
              <ul className="mt-2 divide-y divide-line text-sm">
                {medicationDrafts.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3 py-2">
                    <span>
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
              <h2 className="font-semibold">Valeurs lues et décisions</h2>
              <ul className="mt-2 divide-y divide-line text-sm">
                {drafts.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {(d.analyteCode && getAnalyte(d.analyteCode)?.nameFr) || d.rawLabel} · lu « {d.rawValue} {d.rawUnit ?? ''} »
                    </span>
                    <Chip tone={d.status === 'rejected' ? 'neutral' : 'sage'}>{STATUS_FR[d.status]}</Chip>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {moduleAllowed(ctx.active, 'documents', 'write') && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-3">Supprimer ce document</summary>
              <form action={deleteDocumentAction} className="mt-2 flex flex-wrap items-center gap-3">
                <input type="hidden" name="documentId" value={doc.id} />
                <Meta>L’original sera effacé. Les résultats déjà validés resteront dans vos analyses.</Meta>
                <button type="submit" className="rounded-lg bg-red-2 px-3 py-2 font-medium text-red">
                  Confirmer la suppression
                </button>
              </form>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
