import Link from 'next/link';

// Pages dépendantes de la session : jamais pré-générées.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-6 sm:py-10">
      <Link href="/" className="font-display text-3xl tracking-wide text-petrol">
        BILANX
      </Link>
      <p className="mb-5 mt-1 text-sm text-ink-3 sm:mb-7">Toute votre santé, en un seul endroit.</p>
      <main id="contenu" className="card w-full max-w-[440px] p-5 sm:p-8">
        {children}
      </main>
      <p className="mt-6 max-w-[440px] text-center text-[13px] leading-5 text-ink-3">
        Version d’essai, pas encore homologuée pour des données de santé réelles. Ne remplace pas un avis médical. Urgence : 15 ou 112.
      </p>
    </div>
  );
}
