import type { Metadata } from 'next';
import DocumentsPage from '../documents/page';

export const metadata: Metadata = { title: 'Ordonnances' };

/** Accès direct aux ordonnances (menu, barre du téléphone) : la liste des documents de cette catégorie. */
export default async function PrescriptionsPage({ searchParams }: { searchParams: Promise<{ supprime?: string }> }) {
  const sp = await searchParams;
  return DocumentsPage({ searchParams: Promise.resolve({ ...sp, cat: 'ordonnances' }) });
}
