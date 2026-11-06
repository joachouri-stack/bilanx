import { Card, PageHeader } from './ui';

export function ModuleForbidden({ title, profileName }: { title: string; profileName: string }) {
  return (
    <div className="fade-in">
      <PageHeader title={title} />
      <Card className="max-w-xl">
        <p className="font-semibold">Accès non autorisé</p>
        <p className="mt-1 text-sm text-ink-2">
          Le ou la gestionnaire du profil « {profileName} » ne vous a pas donné accès à cette rubrique. Vous pouvez lui demander de
          modifier vos autorisations.
        </p>
      </Card>
    </div>
  );
}
