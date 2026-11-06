import type { Metadata } from 'next';
import Link from 'next/link';
import { getAnalyte } from '@bilanx/domain';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { Card, PageHeader, buttonClass } from '@/components/ui';
import { Icon } from '@/components/icon';
import { LabEntryForm } from '@/components/lab-entry-form';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Ajouter un résultat' };

export default async function AddLabPage({ searchParams }: { searchParams: Promise<{ analyse?: string }> }) {
  const ctx = await appContext();
  const { analyse } = await searchParams;
  if (ctx.active.kind === 'demo') {
    return (
      <div className="fade-in">
        <PageHeader title="Ajouter un résultat" />
        <Card className="max-w-xl">
          <p className="text-sm text-ink-2">
            Le profil de démonstration est en lecture seule. Choisissez votre profil (ou celui d’un proche) dans le sélecteur pour saisir un
            résultat.
          </p>
        </Card>
      </div>
    );
  }
  if (!moduleAllowed(ctx.active, 'lab', 'write'))
    return <ModuleForbidden title="Ajouter un résultat" profileName={ctx.active.access.displayName} />;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  return (
    <div className="fade-in">
      <PageHeader
        title="Ajouter un résultat"
        subtitle={`Prise de sang de ${ctx.active.access.displayName}`}
        actions={
          <Link href="/analyses" className={buttonClass({ variant: 'ghost', className: '-ml-3' })}>
            <Icon name="chevronLeft" className="size-5" />
            Analyses
          </Link>
        }
      />
      <Card className="max-w-2xl !p-4 sm:!p-6">
        <LabEntryForm today={today} initialAnalyte={analyse && getAnalyte(analyse) ? analyse : undefined} />
      </Card>
    </div>
  );
}
