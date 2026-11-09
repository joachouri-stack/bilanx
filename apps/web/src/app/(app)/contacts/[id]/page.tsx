import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { contactInitials, contactName } from '@bilanx/domain';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { contacts } from '@/lib/server/auth';
import { deleteContactAction } from '@/lib/server/actions';
import { buttonClass, Card, CardHeader, Meta } from '@/components/ui';
import { Icon } from '@/components/icon';
import { ConfirmDelete } from '@/components/autres-confirmer';
import { ContactForm } from '@/components/contact-form';
import { ContactDetails } from '@/components/contact-actions';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Contact' };

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cree?: string; modifie?: string }> }) {
  const ctx = await appContext();
  if (ctx.active.kind !== 'real') notFound();
  if (!moduleAllowed(ctx.active, 'appointments')) return <ModuleForbidden title="Contacts" profileName={ctx.active.access.displayName} />;
  const { id } = await params;
  const sp = await searchParams;
  const c = await contacts().get(ctx.user, ctx.active.access.profileId, id);
  if (!c) notFound();
  const canWrite = moduleAllowed(ctx.active, 'appointments', 'write');
  const name = contactName(c);
  const hasDetails = !!(c.phone || c.email || c.address);

  return (
    <div className="fade-in">
      <Link href="/contacts" className={buttonClass({ variant: 'ghost', className: '-ml-3 mb-2' })}>
        <Icon name="chevronLeft" className="size-5" /> Contacts
      </Link>
      <header className="mb-5 flex items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center rounded-full bg-sage-2 text-xl font-semibold text-sage" aria-hidden>
          {contactInitials(c)}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold leading-tight sm:text-[32px]">{name}</h1>
          {c.specialty && <p className="mt-0.5 text-ink-2">{c.specialty}</p>}
        </div>
      </header>
      {(sp.cree || sp.modifie) && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          {sp.cree ? 'Contact ajouté.' : 'Modifications enregistrées.'}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            {hasDetails ? (
              <ContactDetails c={c} />
            ) : (
              <p className="text-sm text-ink-2">Aucune coordonnée. {canWrite && 'Ajoutez un téléphone, un e-mail ou une adresse ci-contre.'}</p>
            )}
            {c.notes && (
              <div className="mt-3 rounded-xl bg-surface-2 p-3.5">
                <p className="text-sm font-medium text-ink-3">Notes</p>
                <p className="mt-1 whitespace-pre-line text-sm">{c.notes}</p>
              </div>
            )}
          </Card>
          {c.address && <Meta>L’itinéraire s’ouvre dans Google Maps ; « Plans » et « Waze » proposent les autres applications GPS.</Meta>}
          {canWrite && <ConfirmDelete action={deleteContactAction} fields={{ id: c.id }} label="Supprimer ce contact" className="-ml-3" />}
        </div>
        {canWrite && (
          <Card>
            <CardHeader title="Modifier" />
            <ContactForm
              initial={{
                id: c.id,
                firstName: c.firstName ?? '',
                lastName: c.lastName ?? '',
                specialty: c.specialty ?? '',
                phone: c.phone ?? '',
                email: c.email ?? '',
                address: c.address ?? '',
                notes: c.notes ?? '',
              }}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
