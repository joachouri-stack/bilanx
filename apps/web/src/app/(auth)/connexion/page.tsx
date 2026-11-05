import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/auth-forms';
import { PasskeySignIn } from '@/components/passkey-forms';
import { currentSession } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'Connexion' };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const { suite } = await searchParams;
  const s = await currentSession();
  if (s?.mfaPassed) redirect(suite && suite.startsWith('/') && !suite.startsWith('//') ? suite : '/tableau-de-bord');
  return (
    <>
      <h1 className="mb-5 font-display text-2xl font-semibold">Connexion</h1>
      <SignInForm suite={suite} />
      <div className="my-5 flex items-center gap-3 text-xs text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" /> ou <span className="h-px flex-1 bg-line" />
      </div>
      <PasskeySignIn suite={suite} />
    </>
  );
}
