import type { Metadata } from 'next';
import Link from 'next/link';
import { RELATIONSHIPS, ROLE_LABELS } from '@bilanx/profiles';
import { appContext } from '@/lib/server/context';
import { Card, Chip, Meta, PageHeader } from '@/components/ui';
import { CreateRelativeForm } from '@/components/family-forms';

export const metadata: Metadata = { title: 'Famille & Profils' };

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ 'profil-supprime'?: string }> }) {
  const ctx = await appContext();
  const sp = await searchParams;
  const managed = ctx.profiles.filter((p) => p.role === 'owner');
  const shared = ctx.profiles.filter((p) => p.role !== 'owner');
  const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

  return (
    <div className="fade-in">
      <PageHeader title="Famille & Profils" subtitle="Chaque profil a des données entièrement séparées. Vous décidez qui y accède, module par module." />
      {sp['profil-supprime'] && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Profil supprimé. Ses données seront effacées définitivement dans 30 jours.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="font-semibold">Profils que je gère</h2>
            <ul className="mt-3 divide-y divide-line">
              {managed.map((p) => (
                <li key={p.profileId} className="flex items-center justify-between gap-3 py-3">
                  <span>
                    <span className="block font-medium">{p.displayName}</span>
                    <span className="text-xs text-ink-3">{p.relationship ? RELATIONSHIPS[p.relationship] : 'Proche'}</span>
                  </span>
                  <Link href={`/famille/${p.profileId}`} className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2">
                    Accès et journal
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="font-semibold">Profils partagés avec moi</h2>
            {shared.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Aucun. Quand un proche vous invite, son profil apparaît ici après votre acceptation.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {shared.map((p) => (
                  <li key={p.profileId} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block font-medium">{p.displayName}</span>
                      <span className="text-xs text-ink-3">
                        {ROLE_LABELS[p.role]}
                        {p.expiresAt ? ` · jusqu’au ${fmt.format(p.expiresAt)}` : ''}
                      </span>
                    </span>
                    <Link href={`/famille/${p.profileId}`} className="min-h-10 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2">
                      Mes autorisations
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Meta>
            Un aidant n’obtient jamais automatiquement l’accès aux données d’un proche : il faut une invitation du gestionnaire du profil,
            acceptée par l’aidant. Chaque accès peut être retiré à tout moment et chaque consultation est journalisée.
          </Meta>
        </div>
        <Card>
          <h2 className="font-semibold">Ajouter un proche</h2>
          <p className="mb-4 mt-1 text-sm text-ink-3">
            Pour une personne qui ne gère pas elle-même son compte (enfant, parent âgé). Si elle peut le faire, il est préférable
            qu’elle crée son propre compte et vous invite.
          </p>
          <CreateRelativeForm />
          <div className="mt-3">
            <Chip tone="neutral">Votre déclaration est horodatée et conservée</Chip>
          </div>
        </Card>
      </div>
    </div>
  );
}
