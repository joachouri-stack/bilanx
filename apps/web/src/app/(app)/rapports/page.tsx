import type { Metadata } from 'next';
import { addDays, formatLocalDate } from '@bilanx/domain';
import { SECTION_KEYS, SECTION_LABELS } from '@bilanx/reports';
import { demoToday } from '@/lib/demo-data';
import { appContext, moduleAllowed } from '@/lib/server/context';
import { SECTION_MODULE } from '@/lib/server/report-data';
import { Card, Meta, PageHeader } from '@/components/ui';
import { ModuleForbidden } from '@/components/module-forbidden';
import { ReportForm } from '@/components/report-form';

export const metadata: Metadata = { title: 'Rapports PDF' };


export default async function ReportsPage() {
  const ctx = await appContext();
  const name = ctx.active.kind === 'real' ? ctx.active.access.displayName : 'Claire (démonstration)';
  if (!moduleAllowed(ctx.active, 'reports')) return <ModuleForbidden title="Rapports PDF" profileName={name} />;
  const today = demoToday();
  const allowed = SECTION_KEYS.filter((k) => moduleAllowed(ctx.active, SECTION_MODULE[k]));
  const blocked = SECTION_KEYS.filter((k) => !allowed.includes(k));

  return (
    <div className="fade-in">
      <PageHeader title="Rapports PDF" subtitle={`Profil : ${name}`} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <h2 className="font-semibold">Préparer un rapport pour la consultation</h2>
          <ReportForm
            sections={allowed.map((k) => ({ key: k, label: SECTION_LABELS[k] }))}
            today={formatLocalDate(today)}
            minDate={formatLocalDate(addDays(today, -730))}
          />
          {blocked.length > 0 && <Meta className="mt-3">Non autorisé pour vous sur ce profil : {blocked.map((k) => SECTION_LABELS[k]).join(', ')}.</Meta>}
        </Card>
        <Card>
          <h2 className="font-semibold">Contenu du rapport</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Données disponibles par rubrique, avec leur source (bilan scanné, import, saisie manuelle).</li>
            <li>Glycémie : statistiques et profil sur 24 h ; GMI seulement s’il est fiable, et présenté comme une estimation.</li>
            <li>HbA1c aux dates réelles de prélèvement ; autres analyses avec les références de chaque laboratoire.</li>
            <li>Insuline : totaux par jour, modifications prescrites.</li>
            <li>Journal et rendez-vous.</li>
          </ul>
          <Meta className="mt-3">
            Les valeurs saisies à la main sont marquées (S). Les données absentes ou non autorisées sont signalées, jamais complétées. Le rapport n’est pas
            conservé par BILANX : il est produit à la demande.
          </Meta>
          <Meta className="mt-3">Partage sécurisé avec un professionnel : utilisez « Famille & Profils › Inviter » (accès en lecture, durée limitée).</Meta>
        </Card>
      </div>
    </div>
  );
}
