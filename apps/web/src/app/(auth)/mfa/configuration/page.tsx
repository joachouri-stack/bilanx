import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TotpConfirmForm } from '@/components/auth-forms';
import { currentSession, startTotpEnrollment } from '@/lib/server/auth';
import { skipMfaAction } from '@/lib/server/actions';
import { buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Configurer la double authentification' };
export const dynamic = 'force-dynamic';

export default async function MfaSetupPage() {
  const s = await currentSession();
  if (!s) redirect('/connexion');
  if (s.mfaEnrolled && !s.mfaPassed) redirect('/mfa');
  // Après validation, l'action pose le nouveau cookie et Next.js régénère cette page :
  // on garde la même structure pour que le formulaire conserve l'affichage des codes de secours.
  const enrollment = s.mfaEnrolled ? null : await startTotpEnrollment(s);
  const grouped = enrollment?.secret.match(/.{1,4}/g)?.join(' ');
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Protégez votre compte</h1>
      <section className="mb-5">
        {enrollment ? (
          <>
            <p className="mt-1 text-sm text-ink-2">
              Recommandé : en plus du mot de passe, un code à 6 chiffres donné par une application (app Mots de passe de l’iPhone, Google
              Authenticator…).
            </p>
            <ol className="mt-5 flex flex-col gap-4 text-sm">
              <li>
                <strong>1.</strong> Scannez ce QR code avec l’application :
                {/* SVG généré côté serveur par la bibliothèque qrcode à partir de notre propre URI */}
                <div className="mx-auto mt-3 w-48 rounded-xl border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }} />
                <details className="mt-2">
                  <summary className="flex min-h-11 cursor-pointer items-center text-petrol">Impossible de scanner ? Saisir la clé à la main</summary>
                  <code className="mt-2 block break-all rounded-lg bg-surface-2 p-2.5 font-mono text-[13px] tracking-wider">{grouped}</code>
                </details>
              </li>
              <li>
                <strong>2.</strong> Saisissez le code à 6 chiffres affiché :
              </li>
            </ol>
          </>
        ) : null}
      </section>
      <TotpConfirmForm alreadyEnrolled={s.mfaEnrolled} />
      {enrollment && !s.mfaPassed && (
        <form action={skipMfaAction} className="mt-6 border-t border-line pt-5 text-center">
          <button type="submit" className={buttonClass({ variant: 'ghost' })}>
            Continuer sans double authentification
          </button>
          <p className="mt-1 text-[13px] text-ink-3">Vous pourrez l’activer plus tard dans Paramètres.</p>
        </form>
      )}
    </>
  );
}
