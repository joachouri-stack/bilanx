import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { sharing } from '@/lib/server/auth';
import { ShareCodeForm } from '@/components/share-forms';
import { buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Rapport partagé', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const fmtD = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' });
const fmtDT = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long', timeStyle: 'short' });
const day = (iso: string) => fmtD.format(new Date(`${iso}T12:00:00Z`));

const UNAVAILABLE: Record<string, string> = {
  expired: 'Ce partage a expiré.',
  revoked: 'Ce partage a été arrêté par la personne qui l’avait créé.',
  locked: 'Ce partage est bloqué après plusieurs codes erronés.',
  exhausted: 'Le nombre d’ouvertures autorisé est atteint.',
};

/** Page du professionnel de santé : aucune donnée de santé avant la saisie du bon code. */
export default async function SharedReportPage({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const info = await sharing().publicInfo(jeton);
  const viewer = (await cookies()).get('bilanx_partage')?.value;
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Link href="/" className="font-display text-3xl tracking-wide text-petrol">
        BILANX
      </Link>
      <p className="mb-7 mt-1 text-sm text-ink-3">Rapport de suivi partagé de façon sécurisée</p>
      <main id="contenu" className={`card w-full p-6 sm:p-8 ${viewer && info?.status === 'active' ? 'max-w-5xl' : 'max-w-[480px]'}`}>
        {!info ? (
          <>
            <h1 className="font-display text-2xl font-semibold">Lien introuvable</h1>
            <p className="mt-3 text-sm text-ink-2">Vérifiez l’adresse reçue, ou demandez un nouveau lien à votre patient.</p>
          </>
        ) : info.status === 'revoked' || info.status === 'expired' || (info.status !== 'active' && !viewer) ? (
          <>
            <h1 className="font-display text-2xl font-semibold">Rapport indisponible</h1>
            <p className="mt-3 text-sm text-ink-2">{UNAVAILABLE[info.status]} Demandez un nouveau lien à votre patient.</p>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-semibold">Rapport de {info.sharerName}</h1>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-1.5">
              {info.recipient && (
                <>
                  <dt className="mt-2 text-ink-3 sm:mt-0">Destiné à</dt>
                  <dd>{info.recipient}</dd>
                </>
              )}
              <dt className="mt-2 text-ink-3 sm:mt-0">Période</dt>
              <dd>
                du {day(info.periodStart)} au {day(info.periodEnd)}
              </dd>
              <dt className="mt-2 text-ink-3 sm:mt-0">Accessible jusqu’au</dt>
              <dd>{fmtDT.format(info.expiresAt)}</dd>
            </dl>
            {viewer ? (
              <div className="mt-5 flex flex-col gap-3">
                <iframe src={`/partage/${encodeURIComponent(jeton)}/rapport`} title={`Rapport de ${info.sharerName}`} className="h-[75vh] w-full rounded-xl border border-line bg-white" />
                <div className="flex flex-wrap items-center gap-3">
                  <a href={`/partage/${encodeURIComponent(jeton)}/rapport?telecharger=1`} className={buttonClass({ variant: 'primary' })}>
                    Télécharger le PDF
                  </a>
                  <span className="text-[13px] text-ink-3">Consultation ouverte pour 30 minutes. Chaque accès est journalisé et visible par le patient.</span>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <p className="mb-3 text-sm text-ink-2">
                  Saisissez le code à 8 chiffres que votre patient vous a transmis séparément (oralement ou par message).
                </p>
                <ShareCodeForm token={jeton} />
              </div>
            )}
          </>
        )}
      </main>
      <p className="mt-6 max-w-[480px] text-center text-[13px] text-ink-3">
        Document établi à partir des données saisies, scannées ou importées par le patient ; il ne constitue ni un diagnostic ni une
        recommandation. Version d’essai.
      </p>
    </div>
  );
}
