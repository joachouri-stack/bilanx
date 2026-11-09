import type { Metadata } from 'next';
import { appContext } from '@/lib/server/context';
import { vault } from '@/lib/server/auth';
import { PageHeader } from '@/components/ui';
import { Icon } from '@/components/icon';
import { Disclosure } from '@/components/disclosure';
import { VaultAddForm, VaultList } from '@/components/vault';

export const metadata: Metadata = { title: 'Mes identifiants' };
export const dynamic = 'force-dynamic';

/** Coffre d'identifiants personnels (Doctolib, Ameli, mutuelle…) : propre au compte, jamais partagé avec les proches. */
export default async function VaultPage() {
  const ctx = await appContext();
  const items = await vault().list(ctx.user.accountId);
  return (
    <div className="fade-in">
      <PageHeader title="Mes identifiants" subtitle="Doctolib, Ameli, mutuelle… au même endroit" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <VaultList items={items.map((e) => ({ id: e.id, service: e.service, url: e.url, login: e.login, note: e.note }))} />
          <p className="flex items-start gap-2 px-1 text-[13px] text-ink-3">
            <Icon name="key" className="mt-0.5 size-4 shrink-0" />
            Mots de passe chiffrés, visibles par vous seul (jamais par vos proches). Un mot de passe affiché se masque au bout de 30 secondes.
          </p>
        </div>
        <Disclosure
          id="ajouter-identifiant"
          className="group scroll-mt-20 rounded-[var(--radius-card,18px)] border border-line bg-surface shadow-[var(--shadow-card)]"
          initialOpen={items.length === 0}
          summary={
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
              <span className="grid size-9 place-items-center rounded-full bg-petrol-2 text-petrol" aria-hidden>
                <Icon name="plus" className="size-5" />
              </span>
              <h2 className="flex-1 font-semibold">Ajouter un identifiant</h2>
              <Icon name="chevronDown" className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
            </summary>
          }
        >
          <div className="border-t border-line px-4 pb-4 pt-4">
            <VaultAddForm />
          </div>
        </Disclosure>
      </div>
    </div>
  );
}
