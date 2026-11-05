import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PLANNED_DETAILS } from '@/lib/navigation';
import { Card, Chip, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/server/auth';

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  return { title: PLANNED_DETAILS[`/${module}`]?.title ?? 'Page introuvable' };
}

export default async function PlannedModule({ params }: { params: Promise<{ module: string }> }) {
  await requireUser();
  const { module } = await params;
  const info = PLANNED_DETAILS[`/${module}`];
  if (!info) notFound();
  return (
    <div className="fade-in">
      <PageHeader title={info.title} subtitle="Ce module n’est pas encore disponible dans cette version." />
      <Card className="max-w-2xl">
        <Chip tone="petrol">Prévu : {info.version}</Chip>
        <h2 className="mt-4 font-semibold">Ce qu’il nécessite</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
          {info.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-3">
          Nous n’affichons pas de fonctionnalité simulée comme si elle était active. Voir <code>docs/09-feuille-de-route.md</code>.
        </p>
      </Card>
    </div>
  );
}
