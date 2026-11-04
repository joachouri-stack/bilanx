import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MfaVerifyForm } from '@/components/auth-forms';
import { requirePendingMfa } from '@/lib/server/auth';
import { signOutAction } from '@/lib/server/actions';

export const metadata: Metadata = { title: 'Double authentification' };

export default async function MfaPage() {
  const s = await requirePendingMfa();
  if (!s.mfaEnrolled) redirect('/mfa/configuration');
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Double authentification</h1>
      <p className="mb-5 mt-1 text-sm text-ink-3">Connecté en tant que {s.email}</p>
      <MfaVerifyForm />
      <form action={signOutAction} className="mt-4 text-center">
        <button type="submit" className="text-sm text-ink-3 underline">
          Annuler et se déconnecter
        </button>
      </form>
    </>
  );
}
