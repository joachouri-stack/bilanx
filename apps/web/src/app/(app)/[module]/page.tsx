import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PLANNED_DETAILS } from '@/lib/navigation';
import { ButtonLink, Card, Chip, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/server/auth';

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  return { title: PLANNED_DETAILS[`/${module}`]?.title ?? 'Page introuvable' };
}

/** Rubrique prévue mais pas encore disponible : rien de simulé, un texte simple. */
export default async function PlannedModule({ params }: { params: Promise<{ module: string }> }) {
  await requireUser();
  const { module } = await params;
  const info = PLANNED_DETAILS[`/${module}`];
  if (!info) notFound();
  return (
    <div className="fade-in">
      <PageHeader title={info.title} />
      <Card className="max-w-2xl">
        <Chip tone="petrol">Bientôt</Chip>
        <p className="mt-3 text-[17px] font-semibold">Bientôt disponible.</p>
        <p className="mt-1 text-ink-2">
          Cette rubrique n’est pas encore prête. Elle ne répondra qu’à partir de vos données enregistrées, en citant ses sources, et ne remplacera pas
          un avis médical.
        </p>
        <div className="mt-4">
          <ButtonLink href="/tableau-de-bord">Retour à l’accueil</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
