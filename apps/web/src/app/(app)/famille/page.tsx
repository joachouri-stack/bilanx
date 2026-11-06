import type { Metadata } from 'next';
import Link from 'next/link';
import { RELATIONSHIPS, ROLE_LABELS } from '@bilanx/profiles';
import { appContext } from '@/lib/server/context';
import { buttonClass, Card, CardHeader, Chip, Meta, PageHeader } from '@/components/ui';
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
      <PageHeader title="Famille & Profils" subtitle="Chaque profil a ses propres données. Vous décidez qui y accède, rubrique par rubrique." />
      {sp['profil-supprime'] && (
        <p role="status" className="mb-4 rounded-xl bg-sage-2 px-4 py-3 text-sm">
          Profil supprimé. Ses données seront effacées définitivement dans 30 jours.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="Profils que je gère" />
            <ul className="divide-y divide-line">
              {managed.map((p) => (
                <li key={p.profileId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium">{p.displayName}</span>
                    <span className="block text-[13px] text-ink-3">{p.relationship ? RELATIONSHIPS[p.relationship] : 'Proche'}</span>
                  </span>
                  <Link href={`/famille/${p.profileId}`} className={buttonClass({ variant: 'secondary' })}>
                    Accès et journal
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Profils partagés avec moi" />
            {shared.length === 0 ? (
              <p className="text-sm text-ink-2">Aucun. Quand un proche vous invite, son profil apparaît ici dès que vous acceptez.</p>
            ) : (
              <ul className="divide-y divide-line">
                {shared.map((p) => (
                  <li key={p.profileId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                    <span className="min-w-0">
                      <span className="block font-medium">{p.displayName}</span>
                      <span className="block text-[13px] text-ink-3">
                        {ROLE_LABELS[p.role]}
                        {p.expiresAt ? ` · jusqu’au ${fmt.format(p.expiresAt)}` : ''}
                      </span>
                    </span>
                    <Link href={`/famille/${p.profileId}`} className={buttonClass({ variant: 'secondary' })}>
                      Mes autorisations
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Meta>
            Un aidant n’a accès aux données d’un proche qu’après une invitation acceptée. Chaque accès peut être retiré à tout moment, et chaque
            consultation est notée dans le journal.
          </Meta>
        </div>
        <Card>
          <CardHeader title="Ajouter un proche" />
          <p className="mb-4 text-sm text-ink-2">
            Pour une personne qui ne gère pas elle-même son compte (enfant, parent âgé). Si elle le peut, mieux vaut qu’elle crée son propre compte et
            vous invite.
          </p>
          <CreateRelativeForm />
          <div className="mt-3">
            <Chip tone="neutral">Votre déclaration est datée et conservée</Chip>
          </div>
        </Card>
      </div>
    </div>
  );
}
