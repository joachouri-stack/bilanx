import type { Metadata } from 'next';
import { AnalyteDetail } from '@/components/analyte-detail';

export const metadata: Metadata = { title: 'HbA1c' };

/** Rubrique « HbA1c » : dernier résultat, évolution et historique des HbA1c de laboratoire. */
export default async function HbA1cPage({ searchParams }: { searchParams: Promise<{ ajout?: string; suppression?: string }> }) {
  return <AnalyteDetail code="hba1c" sp={await searchParams} />;
}
