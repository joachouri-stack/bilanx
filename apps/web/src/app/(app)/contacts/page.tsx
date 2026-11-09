import type { Metadata } from 'next';
import Link from 'next/link';
import { contactInitials, contactName } from '@bilanx/domain';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { contacts } from '@/lib/server/auth';
import { EmptyState, Meta, PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Disclosure } from '@/components/disclosure';
import { ContactForm } from '@/components/contact-form';
import { ContactQuickActions } from '@/components/contact-actions';
import { ModuleForbidden } from '@/components/module-forbidden';

export const metadata: Metadata = { title: 'Contacts' };

const card = 'relative overflow-hidden rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]';
const panelSummary = 'flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden';

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire';
  if (!moduleAllowed(ctx.active, 'appointments')) return <ModuleForbidden title="Contacts" profileName={name} />;
  const sp = await searchParams;
  if (ctx.active.kind === 'demo') {
    return (
      <div className="fade-in">
        <PageHeader title="Contacts" subtitle="Vos professionnels de santé, à portée d’un appel" />
        <div className="max-w-2xl">
          <EmptyState title="Aucun contact" description="Le profil de démonstration est en lecture seule : choisissez votre profil pour ajouter vos soignants." />
        </div>
      </div>
    );
  }
  const canWrite = moduleAllowed(ctx.active, 'appointments', 'write');
  const list = await contacts().list(ctx.user, ctx.active.access.profileId);

  return (
    <div className="fade-in">
      <PageHeader title="Contacts" subtitle="Vos professionnels de santé, à portée d’un appel" />
      {sp.supprime && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Contact supprimé.
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {list.length === 0 ? (
            <section className={`${card} p-6 text-center`}>
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-sage-2 text-sage" aria-hidden>
                <Icon name="contact" className="size-7" />
              </span>
              <p className="mt-3 font-semibold">Aucun contact pour l’instant</p>
              {canWrite && <p className="mt-1 text-sm text-ink-2">Ajoutez votre médecin, votre kiné, votre laboratoire… puis appelez, écrivez ou lancez le GPS en un toucher.</p>}
            </section>
          ) : (
            <section aria-label="Liste des contacts" className={`${card} p-2 sm:p-3`}>
              <ul className="divide-y divide-line">
                {list.map((c) => {
                  const n = contactName(c);
                  return (
                    <li key={c.id} className="flex items-center gap-2 py-1">
                      <Link href={`/contacts/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-surface-2 active:scale-[0.99]">
                        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sage-2 text-[15px] font-semibold text-sage" aria-hidden>
                          {contactInitials(c)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{n}</span>
                          {c.specialty && <span className="block truncate text-sm text-ink-2">{c.specialty}</span>}
                        </span>
                      </Link>
                      <ContactQuickActions c={c} name={n} />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {list.length > 0 && <Meta>Touchez un bouton pour appeler, écrire un e-mail ou lancer l’itinéraire dans votre GPS.</Meta>}
        </div>

        {canWrite && (
          <Disclosure
            id="nouveau-contact"
            className={`group scroll-mt-20 ${card}`}
            initialOpen={list.length === 0}
            summary={
              <summary className={panelSummary}>
                <span className="grid size-9 place-items-center rounded-full bg-sage-2 text-sage" aria-hidden>
                  <Icon name="plus" className="size-5" />
                </span>
                <h2 className="flex-1 font-semibold">Nouveau contact</h2>
                <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
              </summary>
            }
          >
            <div className="border-t border-line px-4 pb-4 pt-4">
              <ContactForm />
            </div>
          </Disclosure>
        )}
      </div>
    </div>
  );
}
