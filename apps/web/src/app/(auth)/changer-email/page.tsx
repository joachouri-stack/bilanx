import type { Metadata } from 'next';
import Link from 'next/link';
import { ConfirmEmailChangeForm } from '@/components/account-forms';

export const metadata: Metadata = { title: 'Confirmer ma nouvelle adresse' };

export default async function ConfirmEmailChangePage({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  return (
    <>
      <h1 className="mb-5 font-display text-2xl font-semibold">Confirmer ma nouvelle adresse e-mail</h1>
      {jeton ? (
        <ConfirmEmailChangeForm token={jeton} />
      ) : (
        <p className="text-sm text-ink-2">
          Lien incomplet. Ouvrez le lien reçu par e-mail, ou refaites la demande depuis les{' '}
          <Link href="/parametres" className="text-petrol underline">
            paramètres
          </Link>
          .
        </p>
      )}
    </>
  );
}
