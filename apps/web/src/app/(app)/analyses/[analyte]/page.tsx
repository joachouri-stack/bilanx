import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AnalyteDetail } from '@/components/analyte-detail';
import { analyteHref } from '@/lib/navigation';

// Titre générique : les métadonnées sont calculées avant le contrôle de session.
export const metadata: Metadata = { title: 'Analyse' };

export default async function AnalytePage({
  params,
  searchParams,
}: {
  params: Promise<{ analyte: string }>;
  searchParams: Promise<{ ajout?: string; suppression?: string }>;
}) {
  const sp = await searchParams;
  const { analyte: code } = await params;
  // L'HbA1c a sa propre rubrique : les anciens liens /analyses/hba1c y mènent.
  if (code === 'hba1c') {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === 'string')).toString();
    redirect(q ? `${analyteHref(code)}?${q}` : analyteHref(code));
  }
  return <AnalyteDetail code={code} sp={sp} />;
}
