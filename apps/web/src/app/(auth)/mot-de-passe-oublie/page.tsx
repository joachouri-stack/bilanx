import type { Metadata } from 'next';
import Link from 'next/link';
import { RequestResetForm } from '@/components/auth-forms';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Mot de passe oublié</h1>
      <p className="mb-5 mt-1 text-sm text-ink-3">La double authentification restera demandée après la réinitialisation.</p>
      <RequestResetForm />
      <p className="mt-4 text-center text-sm">
        <Link href="/connexion" className="text-petrol underline">
          Retour à la connexion
        </Link>
      </p>
    </>
  );
}
