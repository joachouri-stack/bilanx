import type { Metadata } from 'next';
import { ResendVerificationForm, VerifyEmailForm } from '@/components/auth-forms';

export const metadata: Metadata = { title: 'Confirmer mon adresse' };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  return (
    <>
      <h1 className="mb-5 font-display text-2xl font-semibold">Confirmer mon adresse e-mail</h1>
      {jeton ? <VerifyEmailForm token={jeton} /> : <ResendVerificationForm />}
    </>
  );
}
