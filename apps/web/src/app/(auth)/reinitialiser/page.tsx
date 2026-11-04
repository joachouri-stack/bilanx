import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth-forms';

export const metadata: Metadata = { title: 'Nouveau mot de passe' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  return (
    <>
      <h1 className="mb-5 font-display text-2xl font-semibold">Nouveau mot de passe</h1>
      {jeton ? (
        <ResetPasswordForm token={jeton} />
      ) : (
        <p className="text-sm text-ink-2">
          Lien incomplet.{' '}
          <Link href="/mot-de-passe-oublie" className="text-petrol underline">
            Faire une nouvelle demande
          </Link>
        </p>
      )}
    </>
  );
}
