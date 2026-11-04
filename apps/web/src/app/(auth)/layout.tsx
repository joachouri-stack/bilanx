import Link from 'next/link';

// Pages dépendantes de la session : jamais pré-générées.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Link href="/" className="font-display text-3xl tracking-wide text-petrol">
        BILANX
      </Link>
      <p className="mb-7 mt-1 text-sm text-ink-3">Toute votre santé, en un seul endroit.</p>
      <div className="card w-full max-w-[440px] p-6 sm:p-8">{children}</div>
      <p className="mt-6 max-w-[440px] text-center text-xs text-ink-3">
        Prototype en développement, non destiné à des données réelles pour l’instant. BILANX ne remplace pas l’avis d’un professionnel
        de santé. En cas d’urgence : 15 ou 112.
      </p>
    </div>
  );
}
