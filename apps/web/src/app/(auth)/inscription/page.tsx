import type { Metadata } from 'next';
import { SignUpForm } from '@/components/auth-forms';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold">Créer un compte</h1>
      <p className="mb-5 mt-1 text-sm text-ink-2">Votre espace personnel et protégé.</p>
      <SignUpForm />
    </>
  );
}
